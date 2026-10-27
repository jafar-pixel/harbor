import { useSyncExternalStore } from "react";
import {
  accountLinksOn,
  accountMusicToken,
  disconnectMusicLink,
  exchangeMusicLink,
  MusicLinkError,
  musicLinkState,
  subscribeMusicLinks,
  useMusicLinks,
} from "../account-link";

/**
 * YouTube sign in for the web app with Google Identity Services. Signed in to a JL account (and
 * with Google's client secret set on the server), the code model hands the sign in to the account
 * (see ../account-link): it renews itself and every device on that account stays connected.
 * Otherwise the token model keeps an hour-long token in this browser; after that, Reconnect asks
 * Google again, usually without a prompt.
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

type Token = { access: string; expiresAt: number };
export type YouTubeWebState = {
  /** A usable token right now. */
  connected: boolean;
  /** Signed in before; the token ran out and Reconnect will bring it back. */
  linked: boolean;
  error: string | null;
};

type GoogleTokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type GoogleCodeClient = { requestCode: () => void };
type GoogleWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (o: {
          client_id: string;
          scope: string;
          callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void;
          error_callback?: (e: { type?: string; message?: string }) => void;
        }) => GoogleTokenClient;
        initCodeClient: (o: {
          client_id: string;
          scope: string;
          ux_mode: "popup";
          select_account?: boolean;
          callback: (r: { code?: string; error?: string }) => void;
          error_callback?: (e: { type?: string; message?: string }) => void;
        }) => GoogleCodeClient;
        revoke: (token: string, done?: () => void) => void;
      };
    };
  };
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
const accountLinked = () => accountLinksOn() && !!musicLinkState().links.youtube;
/** New sign ins go to the account. */
const accountMode = () => accountLinksOn() && musicLinkState().youtubeServer;

let state: YouTubeWebState = { connected: !!readToken(), linked: readLinked(), error: null };

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

let loading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if ((window as GoogleWindow).google?.accounts?.oauth2) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("Google sign in couldn't load. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
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

/** Sign in with Google (a popup). Call from a click. `edit` also asks to manage playlists. */
export async function connectYouTubeWeb(edit = false): Promise<void> {
  set({ error: null });
  try {
    await loadGis();
    const oauth2 = (window as GoogleWindow).google?.accounts?.oauth2;
    if (!oauth2) throw new Error("Google sign in isn't available in this browser.");
    const failed = (e: { type?: string; message?: string }) =>
      new Error(
        e.type === "popup_closed"
          ? "Google sign in was closed."
          : e.type === "popup_failed_to_open"
            ? "Allow pop-ups for this site, then try again."
            : e.message || "Google sign in failed.",
      );
    if (accountMode()) {
      const code = await new Promise<string>((resolve, reject) => {
        oauth2
          .initCodeClient({
            client_id: JL_GOOGLE_CLIENT_ID,
            // Keep editing once it was granted, so a plain reconnect doesn't take it away.
            scope: edit || youtubeCanEdit() ? EDIT_SCOPE : SCOPE,
            ux_mode: "popup",
            callback: (r) =>
              r.code ? resolve(r.code) : reject(new Error(r.error || "Google sign in failed.")),
            error_callback: (e) => reject(failed(e)),
          })
          .requestCode();
      });
      try {
        await exchangeMusicLink("youtube", { code });
      } catch (error) {
        // Google gives a refresh token only on first consent; one stored before was removed.
        if (error instanceof MusicLinkError && error.code === "relink")
          throw new Error(
            "Google didn't renew the sign in. Remove JL Media Vision at myaccount.google.com/permissions, then connect again.",
          );
        throw error;
      }
      set({ connected: true, linked: true, error: null });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: JL_GOOGLE_CLIENT_ID,
        scope: edit ? EDIT_SCOPE : SCOPE,
        callback: (r) => {
          if (!r.access_token) return reject(new Error(r.error || "Google sign in failed."));
          try {
            localStorage.setItem(
              TOKEN_KEY,
              JSON.stringify({
                access: r.access_token,
                expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000,
              }),
            );
            localStorage.setItem(LINKED_KEY, "1");
            if (edit) localStorage.setItem(EDIT_KEY, "1");
          } catch {
            /* storage blocked: the sign in lasts this page */
          }
          memory = {
            access: r.access_token,
            expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000,
          };
          set({ connected: true, linked: true, error: null });
          resolve();
        },
        error_callback: (e) => reject(failed(e)),
      });
      client.requestAccessToken({ prompt: readLinked() ? "" : "consent" });
    });
  } catch (error) {
    set({ error: error instanceof Error ? error.message : String(error) });
  }
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
