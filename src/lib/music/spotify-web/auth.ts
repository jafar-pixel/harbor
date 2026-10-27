import { useSyncExternalStore } from "react";
import { requestMusicTab } from "../social/inbox";
import { JL_SPOTIFY_CLIENT_ID, SPOTIFY_WEB_CALLBACK_PATH } from "../spotify-setup";
import {
  accountLinksOn,
  accountMusicToken,
  disconnectMusicLink,
  exchangeMusicLink,
  musicLinkState,
  storeMusicLink,
  subscribeMusicLinks as musicLinkSubscribe,
  useMusicLinks,
} from "../account-link";

/**
 * Spotify sign in for the web app: authorization code with PKCE straight from the browser (no
 * secret). Signed in to a JL account, the sign in finishes on the server and the account keeps it
 * (see ../account-link), so every device on that account stays connected. Without an account the
 * tokens stay in this browser. The desktop app signs in natively (src-tauri/src/music/spotify).
 */

const TOKEN_KEY = "jl.spotify.web.v1";
const PENDING_KEY = "jl.spotify.web.pending.v1";
const SCOPES = [
  "user-read-private",
  "user-top-read",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  // Creating, editing and deleting the listener's playlists from the app.
  "playlist-modify-public",
  "playlist-modify-private",
];

type Tokens = { access: string; refresh: string; expiresAt: number; scope?: string };
export type SpotifyWebState = {
  connected: boolean;
  error: string | null;
  /** The sign in that came back from Spotify is being finished. */
  finishing: boolean;
};

const listeners = new Set<() => void>();
const accountLinked = () => accountLinksOn() && !!musicLinkState().links.spotify;
let state: SpotifyWebState = {
  connected: !!readTokens() || accountLinked(),
  error: null,
  finishing: false,
};

function set(next: Partial<SpotifyWebState>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export const spotifyWebState = () => state;

export function useSpotifyWeb(): SpotifyWebState {
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

function readTokens(): Tokens | null {
  try {
    const v = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null") as Tokens | null;
    return v && typeof v.access === "string" && typeof v.refresh === "string" ? v : null;
  } catch {
    return null;
  }
}

function writeTokens(tokens: Tokens | null) {
  try {
    if (tokens) localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the sign in lasts this session */
  }
  set({ connected: !!tokens || accountLinked() });
}

const redirectUri = () => `${window.location.origin}${SPOTIFY_WEB_CALLBACK_PATH}`;

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Off to Spotify's sign in; it comes back to /spotify-callback. */
export async function connectSpotifyWeb(): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  const stateParam = base64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state: stateParam }));
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    client_id: JL_SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state: stateParam,
    scope: SCOPES.join(" "),
  }).toString();
  window.location.assign(url.toString());
}

export function disconnectSpotifyWeb(): void {
  if (accountLinked()) void disconnectMusicLink("spotify").then(() => writeTokens(null));
  writeTokens(null);
  set({ error: null });
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: JL_SPOTIFY_CLIENT_ID, ...body }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token)
    throw new Error(
      json.error_description || json.error || `Spotify sign in failed (${res.status})`,
    );
  return {
    access: json.access_token,
    refresh: json.refresh_token || body.refresh_token || "",
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    scope: json.scope ?? readTokens()?.scope,
  };
}

/** Whether this sign in may change playlists (a sign in from before editing must reconnect). */
export function spotifyCanEdit(): boolean {
  return /playlist-modify/.test(
    (accountLinked() ? musicLinkState().links.spotify?.scope : readTokens()?.scope) ?? "",
  );
}

let pendingCallback: { code: string | null; state: string | null; error: string | null } | null =
  null;
let returned = false;

/** True once after coming back from Spotify's sign in, so the app can open the Music Hub. */
export function takeSpotifyReturn(): boolean {
  const was = returned;
  returned = false;
  return was;
}

/** Read Spotify's answer before the router boots and rewrites the address (see main.tsx). */
export function captureSpotifyCallback(): void {
  if (typeof window === "undefined" || window.location.pathname !== SPOTIFY_WEB_CALLBACK_PATH)
    return;
  const q = new URLSearchParams(window.location.search);
  pendingCallback = { code: q.get("code"), state: q.get("state"), error: q.get("error") };
  // Land on the Music Hub's Spotify tab (see SpotifyReturn).
  window.history.replaceState(window.history.state, "", "/");
  returned = true;
  requestMusicTab("spotify");
  set({ finishing: true });
  void finishSpotifyWeb();
}

async function finishSpotifyWeb(): Promise<void> {
  const answer = pendingCallback;
  pendingCallback = null;
  let pending: { verifier: string; state: string } | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    pending = null;
  }
  try {
    if (!answer) return;
    if (answer.error)
      throw new Error(
        answer.error === "access_denied"
          ? "Spotify sign in was cancelled."
          : `Spotify said: ${answer.error}`,
      );
    if (!answer.code || !pending || pending.state !== answer.state)
      throw new Error("That Spotify sign in expired. Try connecting again.");
    if (accountLinksOn()) {
      await exchangeMusicLink("spotify", {
        code: answer.code,
        verifier: pending.verifier,
        redirectUri: redirectUri(),
      });
      writeTokens(null);
    } else
      writeTokens(
        await tokenRequest({
          grant_type: "authorization_code",
          code: answer.code,
          redirect_uri: redirectUri(),
          code_verifier: pending.verifier,
        }),
      );
    set({ error: null });
  } catch (error) {
    set({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    set({ finishing: false });
  }
}

let refreshing: Promise<Tokens> | null = null;

/** A fresh access token, refreshed a minute before it expires. */
export async function spotifyWebToken(): Promise<string> {
  if (accountLinked())
    return accountMusicToken("spotify").catch((error: unknown) => {
      writeTokens(readTokens());
      set({ error: "Spotify signed you out. Connect again to keep your music here." });
      throw error;
    });
  const tokens = readTokens();
  if (!tokens) throw new Error("Connect Spotify first.");
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.access;
  refreshing ??= tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh })
    .then((next) => {
      writeTokens(next);
      return next;
    })
    .catch((error: unknown) => {
      // A refused refresh means the sign in was revoked (or the account was removed from the app).
      writeTokens(null);
      set({ error: "Spotify signed you out. Connect again to keep your music here." });
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  return (await refreshing).access;
}

// A browser that signed in before accounts kept sign ins hands its Spotify to the account once,
// so the listener's other devices connect too.
let moving = false;
musicLinkSubscribe(() => {
  const links = musicLinkState();
  set({ connected: !!readTokens() || accountLinked() });
  const local = readTokens();
  if (!links.ready || links.links.spotify || !local?.refresh || moving || !accountLinksOn()) return;
  moving = true;
  void storeMusicLink("spotify", local.refresh, local.scope ?? "")
    .then(() => writeTokens(null))
    .catch(() => undefined)
    .finally(() => {
      moving = false;
    });
});
