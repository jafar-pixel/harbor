import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import {
  accountLinksOn,
  accountMusicToken,
  disconnectMusicLink,
  exchangeMusicLink,
  markYouTubeServerOff,
  MusicLinkError,
  musicLinkState,
  subscribeMusicLinks,
  useMusicLinks,
} from "../account-link";

/**
 * YouTube sign in with Google. Signed in to a JL account (and with Google's client secret set on
 * the server), Google's code goes to the account (see ../account-link): it renews itself and every
 * device on that account stays connected. Otherwise an hour-long token stays on this device; after
 * that, Reconnect asks Google again, usually without a prompt.
 */

/** JL Media Vision's Google OAuth client (public). The JL_GOOGLE_CLIENT_ID build variable swaps it. */
export const JL_GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_JL_GOOGLE_CLIENT_ID as string | undefined)?.trim() ||
  "920687425489-gkb74r1s7o7tg7ubl8fdpkq578jlu2dq.apps.googleusercontent.com";

const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
// Full YouTube access, asked for only when someone chooses to edit their playlists.
const EDIT_SCOPE = "https://www.googleapis.com/auth/youtube";
const EDIT_KEY = "jl.youtube.web.edit.v1";
const TOKEN_KEY = "jl.youtube.web.v1";
const LINKED_KEY = "jl.youtube.web.linked.v1";
const PENDING_KEY = "jl.youtube.web.pending.v1";

/** Where Google sends a redirect sign in back to; registered on the Google OAuth client. */
export const YOUTUBE_WEB_CALLBACK_PATH = "/music/youtube-callback";
const redirectUri = () => `${window.location.origin}${YOUTUBE_WEB_CALLBACK_PATH}`;
/**
 * The desktop app's loopback address (src-tauri/src/youtube_signin.rs), registered on the Google
 * OAuth client. Its page isn't on a web address Google can send the sign in back to, its web view
 * blocks Google's pop-up, and Google refuses sign ins inside embedded web views, so it signs in
 * in the listener's own browser, as Spotify does.
 */
const YOUTUBE_DESKTOP_REDIRECT = "http://localhost:8899/youtube";

/** Every browser and the TV app sign in by redirect; the desktop app in the default browser. */
function inDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type Token = { access: string; expiresAt: number };
export type YouTubeWebState = {
  /** A usable token right now. */
  connected: boolean;
  /** Signed in before; the token ran out and Reconnect will bring it back. */
  linked: boolean;
  error: string | null;
};

type GoogleWindow = Window & {
  google?: { accounts?: { oauth2?: { revoke: (token: string, done?: () => void) => void } } };
};

function readToken(): Token | null {
  try {
    const v = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null") as Token | null;
    return v && typeof v.access === "string" && v.expiresAt > Date.now() + 60_000 ? v : null;
  } catch {
    return null;
  }
}

function readLinked(): boolean {
  try {
    return localStorage.getItem(LINKED_KEY) === "1";
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
/** The account keeps this listener's YouTube sign in. */
const accountLinked = () =>
  accountLinksOn() && !!musicLinkState().links.youtube && musicLinkState().youtubeServer;
/** New sign ins go to the account. */
const accountMode = () => accountLinksOn() && musicLinkState().youtubeServer;

// The account may already hold the sign in when this loads (no change event follows).
let state: YouTubeWebState = {
  connected: !!readToken() || accountLinked(),
  linked: readLinked() || accountLinked(),
  error: null,
};

function set(next: Partial<YouTubeWebState>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export const youtubeWebState = () => state;
export function useYouTubeWeb(): YouTubeWebState {
  useMusicLinks();
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

/** Whether the current sign in may change playlists. */
export function youtubeCanEdit(): boolean {
  try {
    if (accountLinked())
      return /auth\/youtube(\s|$)/.test(musicLinkState().links.youtube?.scope ?? "");
    return localStorage.getItem(EDIT_KEY) === "1" && !!readToken();
  } catch {
    return false;
  }
}

/** Sign in with Google (a redirect, or the default browser in the desktop app). Call from a click. `edit` also asks to manage playlists. */
export async function connectYouTubeWeb(edit = false): Promise<void> {
  set({ error: null });
  if (!inDesktopApp()) {
    redirectToGoogle(edit);
    return;
  }
  const request = googleSignIn(edit, YOUTUBE_DESKTOP_REDIRECT);
  let query: string;
  try {
    query = await invoke<string>("youtube_browser_signin", { url: request.url });
  } catch (error) {
    set({ error: error instanceof Error ? error.message : String(error) });
    return;
  }
  const answer = new URLSearchParams(query);
  await finishGoogleSignIn(
    {
      code: answer.get("code"),
      token: answer.get("access_token"),
      expiresIn: Number(answer.get("expires_in")) || 3600,
      state: answer.get("state"),
      error: answer.get("error"),
    },
    request.pending,
    YOUTUBE_DESKTOP_REDIRECT,
  );
}

let memory: Token | null = null;

export function disconnectYouTubeWeb(): void {
  if (accountLinked()) void disconnectMusicLink("youtube");
  const token = memory ?? readToken();
  if (token) (window as GoogleWindow).google?.accounts?.oauth2?.revoke(token.access);
  memory = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LINKED_KEY);
  } catch {
    /* nothing stored */
  }
  set({ connected: false, linked: false, error: null });
}

/** The access token, or an error asking to reconnect once it has run out. */
export async function youtubeWebToken(): Promise<string> {
  if (accountLinked())
    return accountMusicToken("youtube").catch((error: unknown) => {
      if (error instanceof MusicLinkError && error.code === "not_configured")
        markYouTubeServerOff();
      set({ connected: hasToken(), linked: hasToken() || readLinked() });
      throw error instanceof MusicLinkError && error.code !== "failed"
        ? new Error("YouTube signed you out. Connect again to keep your music here.")
        : error;
    });
  const token = (memory && memory.expiresAt > Date.now() + 60_000 ? memory : null) ?? readToken();
  if (!token) {
    if (state.connected) set({ connected: false });
    throw new Error("Your YouTube sign in ran out. Reconnect to keep your music here.");
  }
  return token.access;
}

function hasToken(): boolean {
  return accountLinked() || !!(memory && memory.expiresAt > Date.now()) || !!readToken();
}

subscribeMusicLinks(() => {
  const connected = hasToken();
  if (connected !== state.connected) set({ connected, linked: connected || readLinked() });
});

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type Pending = { state: string; mode: "code" | "token"; edit: boolean; at: number };

/** Google's sign in address sending its answer to `redirect`, and what to check it against. */
function googleSignIn(edit: boolean, redirect: string): { url: string; pending: Pending } {
  const account = accountMode();
  const pending: Pending = {
    state: randomState(),
    mode: account ? "code" : "token",
    edit,
    at: Date.now(),
  };
  const params: Record<string, string> = {
    client_id: JL_GOOGLE_CLIENT_ID,
    redirect_uri: redirect,
    // Keep editing once it was granted, so a plain reconnect doesn't take it away.
    scope: (account ? edit || youtubeCanEdit() : edit) ? EDIT_SCOPE : SCOPE,
    state: pending.state,
    include_granted_scopes: "true",
  };
  if (account) {
    // The account keeps a refresh token, which Google gives only with offline access and consent.
    params.response_type = "code";
    params.access_type = "offline";
    params.prompt = "consent";
  } else {
    params.response_type = "token";
    if (!readLinked()) params.prompt = "consent";
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams(params).toString();
  return { url: url.toString(), pending };
}

/** Off to Google's sign in in this page; it comes back to YOUTUBE_WEB_CALLBACK_PATH. */
function redirectToGoogle(edit: boolean): void {
  const request = googleSignIn(edit, redirectUri());
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(request.pending));
  } catch {
    set({ error: "This browser blocks storage, so Google sign in can't finish here." });
    return;
  }
  window.location.assign(request.url);
}

let returned = false;

/** True once after coming back from Google's sign in, so the app can open the Music Hub. */
export function takeYouTubeReturn(): boolean {
  const was = returned;
  returned = false;
  return was;
}

/** Read Google's answer before the router boots and rewrites the address (see main.tsx). */
export function captureYouTubeCallback(): void {
  if (typeof window === "undefined" || window.location.pathname !== YOUTUBE_WEB_CALLBACK_PATH)
    return;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const answer = {
    code: query.get("code"),
    token: hash.get("access_token"),
    expiresIn: Number(hash.get("expires_in")) || 3600,
    state: query.get("state") ?? hash.get("state"),
    error: query.get("error") ?? hash.get("error"),
  };
  window.history.replaceState(window.history.state, "", "/");
  returned = true;
  void finishYouTubeRedirect(answer);
}

type GoogleAnswer = {
  code: string | null;
  token: string | null;
  expiresIn: number;
  state: string | null;
  error: string | null;
};

async function finishYouTubeRedirect(answer: GoogleAnswer): Promise<void> {
  let pending: Pending | null = null;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null");
    localStorage.removeItem(PENDING_KEY);
  } catch {
    pending = null;
  }
  await finishGoogleSignIn(answer, pending, redirectUri());
}

/** Check Google's answer against the sign in this device started, then keep it. */
async function finishGoogleSignIn(
  answer: GoogleAnswer,
  pending: Pending | null,
  redirect: string,
): Promise<void> {
  try {
    if (answer.error)
      throw new Error(
        answer.error === "access_denied"
          ? "Google sign in was cancelled."
          : `Google said: ${answer.error}`,
      );
    if (!pending || pending.state !== answer.state || Date.now() - pending.at > 15 * 60_000)
      throw new Error("That Google sign in expired. Press Connect to try again.");
    if (pending.mode === "code") {
      if (!answer.code) throw new Error("Google sign in failed.");
      try {
        await exchangeMusicLink("youtube", { code: answer.code, redirectUri: redirect });
      } catch (error) {
        // Google refused the server's client secret: keep this device's own sign in instead.
        if (error instanceof MusicLinkError && error.code === "not_configured") {
          markYouTubeServerOff();
          throw new Error("Almost there. Press Connect once more to finish connecting YouTube.");
        }
        // Google gives a refresh token only on first consent; one stored before was removed.
        if (error instanceof MusicLinkError && error.code === "relink")
          throw new Error(
            "Google didn't renew the sign in. Remove JL Media Vision at myaccount.google.com/permissions, then connect again.",
          );
        throw error;
      }
    } else {
      if (!answer.token) throw new Error("Google sign in failed.");
      const token = { access: answer.token, expiresAt: Date.now() + answer.expiresIn * 1000 };
      memory = token;
      try {
        localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
        localStorage.setItem(LINKED_KEY, "1");
        if (pending.edit) localStorage.setItem(EDIT_KEY, "1");
      } catch {
        /* storage blocked: the sign in lasts this page */
      }
    }
    set({ connected: true, linked: true, error: null });
  } catch (error) {
    set({ error: error instanceof Error ? error.message : String(error) });
  }
}
