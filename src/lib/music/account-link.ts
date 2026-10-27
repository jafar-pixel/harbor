import { useSyncExternalStore } from "react";
import { currentJlSession, jlFunction, jlRest, subscribeJlSession } from "@/lib/jl/account/client";

/**
 * YouTube and Spotify sign ins kept with the JL account (supabase/functions/music-link). A
 * listener connects once; every device signed in to the same account gets short-lived access
 * tokens from the server, which keeps the refresh token. Without a JL account the browser keeps
 * its own sign in, as before.
 */

export type MusicProvider = "spotify" | "youtube";
export type MainService = "youtube" | "spotify";

type Links = Partial<Record<MusicProvider, { scope: string }>>;
export type MusicLinkState = {
  /** The account answered: `links` is what it holds. */
  ready: boolean;
  links: Links;
  /** The server can keep YouTube sign ins (Google's client secret is set there). */
  youtubeServer: boolean;
  /** The listener's chosen main service; null until they pick one. */
  main: MainService | null;
};

const listeners = new Set<() => void>();
let state: MusicLinkState = { ready: false, links: {}, youtubeServer: false, main: null };

function set(next: Partial<MusicLinkState>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export const musicLinkState = () => state;
export function subscribeMusicLinks(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function useMusicLinks(): MusicLinkState {
  return useSyncExternalStore(subscribeMusicLinks, musicLinkState, musicLinkState);
}

/** Signed in to a JL account, so sign ins can live there. */
export const accountLinksOn = () => !!currentJlSession();

export class MusicLinkError extends Error {
  constructor(
    message: string,
    readonly code: "relink" | "not_linked" | "not_configured" | "failed",
  ) {
    super(message);
  }
}

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await jlFunction("music-link", {
    method: "POST",
    body: JSON.stringify({ action, ...body }),
  });
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const code = out.error;
    if (code === "relink" || code === "not_linked" || code === "not_configured")
      throw new MusicLinkError(code, code);
    throw new MusicLinkError(out.error || `Music sign in failed (${res.status})`, "failed");
  }
  return out;
}

type Granted = { access: string; expiresIn: number; scope: string };
const tokens: Partial<Record<MusicProvider, { access: string; expiresAt: number }>> = {};
const inflight: Partial<Record<MusicProvider, Promise<string>>> = {};

function remember(provider: MusicProvider, g: Granted) {
  tokens[provider] = { access: g.access, expiresAt: Date.now() + g.expiresIn * 1000 };
  set({ links: { ...state.links, [provider]: { scope: g.scope } } });
}

function forget(provider: MusicProvider) {
  delete tokens[provider];
  const links = { ...state.links };
  delete links[provider];
  set({ links });
}

/** Finish a sign in on the server so the account keeps it. */
export async function exchangeMusicLink(
  provider: MusicProvider,
  body: Record<string, string>,
): Promise<string> {
  const g = await call<Granted>("exchange", { provider, ...body });
  remember(provider, g);
  return g.access;
}

/** Move a sign in this browser kept on its own into the account. */
export async function storeMusicLink(
  provider: MusicProvider,
  refresh: string,
  scope: string,
): Promise<void> {
  remember(provider, await call<Granted>("store", { provider, refresh, scope }));
}

/** An access token from the account, renewed on the server a couple of minutes before it ends. */
export function accountMusicToken(provider: MusicProvider): Promise<string> {
  const held = tokens[provider];
  if (held && held.expiresAt - Date.now() > 60_000) return Promise.resolve(held.access);
  inflight[provider] ??= call<Granted>("token", { provider })
    .then((g) => {
      remember(provider, g);
      return g.access;
    })
    .catch((error: unknown) => {
      if (
        error instanceof MusicLinkError &&
        (error.code === "relink" || error.code === "not_linked")
      )
        forget(provider);
      throw error;
    })
    .finally(() => {
      delete inflight[provider];
    });
  return inflight[provider];
}

export async function disconnectMusicLink(provider: MusicProvider): Promise<void> {
  forget(provider);
  await call("disconnect", { provider }).catch(() => undefined);
}

let loading: Promise<void> | null = null;
let loadedFor: string | null = null;

/** What the signed-in account holds; runs again when the account changes. */
export function refreshMusicLinks(): Promise<void> {
  const session = currentJlSession();
  const who = session?.userId ?? null;
  if (!who) {
    for (const p of Object.keys(tokens) as MusicProvider[]) delete tokens[p];
    loadedFor = null;
    set({ ready: false, links: {}, youtubeServer: false });
    return Promise.resolve();
  }
  if (loading && loadedFor === who) return loading;
  loadedFor = who;
  loading = (async () => {
    try {
      const out = await call<{
        links: { provider: MusicProvider; scope: string }[];
        youtubeServer: boolean;
      }>("status");
      const links: Links = {};
      for (const l of out.links) links[l.provider] = { scope: l.scope };
      const prefs = await jlRest("music_prefs?select=main_service", { method: "GET" })
        .then((r) => (r.ok ? (r.json() as Promise<{ main_service: MainService }[]>) : []))
        .catch(() => []);
      set({
        ready: true,
        links,
        youtubeServer: out.youtubeServer,
        main: prefs[0]?.main_service ?? null,
      });
    } catch {
      set({ ready: false });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** The server can't keep YouTube sign ins after all (Google refused its client secret). */
export function markYouTubeServerOff(): void {
  set({ youtubeServer: false });
}

/** Choose which service leads the Music Hub and the Lounge. */
export async function setMainService(main: MainService): Promise<void> {
  set({ main });
  const owner = currentJlSession()?.userId;
  if (!owner) return;
  await jlRest("music_prefs", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ owner, main_service: main, updated_at: new Date().toISOString() }),
  }).catch(() => undefined);
}

let lastUser: string | null | undefined;
if (typeof window !== "undefined") {
  const check = () => {
    const who = currentJlSession()?.userId ?? null;
    if (who === lastUser) return;
    lastUser = who;
    void refreshMusicLinks();
  };
  subscribeJlSession(check);
  check();
}
