import { useSyncExternalStore } from "react";

/**
 * YouTube sign in for the web app with Google Identity Services (the token model: no secret, no
 * server). Access lasts about an hour; after that, Reconnect asks Google again, usually without a
 * prompt. Tokens stay in this browser only.
 */

/** JL Media Vision's Google OAuth client (public). The JL_GOOGLE_CLIENT_ID build variable swaps it. */
export const JL_GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_JL_GOOGLE_CLIENT_ID as string | undefined)?.trim() ||
  "920687425489-gkb74r1s7o7tg7ubl8fdpkq578jlu2dq.apps.googleusercontent.com";

const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
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
let state: YouTubeWebState = { connected: !!readToken(), linked: readLinked(), error: null };

function set(next: Partial<YouTubeWebState>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export const youtubeWebState = () => state;
export function useYouTubeWeb(): YouTubeWebState {
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

/** Sign in with Google (a popup). Call from a click. */
export async function connectYouTubeWeb(): Promise<void> {
  set({ error: null });
  try {
    await loadGis();
    const oauth2 = (window as GoogleWindow).google?.accounts?.oauth2;
    if (!oauth2) throw new Error("Google sign in isn't available in this browser.");
    await new Promise<void>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: JL_GOOGLE_CLIENT_ID,
        scope: SCOPE,
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
        error_callback: (e) =>
          reject(
            new Error(
              e.type === "popup_closed"
                ? "Google sign in was closed."
                : e.type === "popup_failed_to_open"
                  ? "Allow pop-ups for this site, then try again."
                  : e.message || "Google sign in failed.",
            ),
          ),
      });
      client.requestAccessToken({ prompt: readLinked() ? "" : "consent" });
    });
  } catch (error) {
    set({ error: error instanceof Error ? error.message : String(error) });
  }
}

let memory: Token | null = null;

export function disconnectYouTubeWeb(): void {
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
export function youtubeWebToken(): string {
  const token = (memory && memory.expiresAt > Date.now() + 60_000 ? memory : null) ?? readToken();
  if (!token) {
    if (state.connected) set({ connected: false });
    throw new Error("Your YouTube sign in ran out. Reconnect to keep your music here.");
  }
  return token.access;
}
