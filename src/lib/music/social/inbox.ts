import { useEffect, useSyncExternalStore } from "react";
import { subscribeJlSession, jlAccountContext } from "@/lib/jl/account/client";
import { songInbox, type SharedSong } from "./api";

/**
 * Songs friends have sent, checked once a minute while the app is visible. `arrivals` holds
 * songs that came in since the last check, for the "Jafar sent you a song" toast.
 */

export type InboxState = {
  songs: SharedSong[];
  unread: number;
  arrivals: SharedSong[];
  loaded: boolean;
};

const POLL_MS = 60_000;
let state: InboxState = { songs: [], unread: 0, arrivals: [], loaded: false };
const listeners = new Set<() => void>();
let seen = new Set<string>();
let first = true;
let users = 0;
let timer = 0;

function set(next: Partial<InboxState>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export const inboxState = () => state;

export async function refreshInbox(): Promise<void> {
  if (!jlAccountContext()) {
    seen = new Set();
    first = true;
    set({ songs: [], unread: 0, arrivals: [], loaded: false });
    return;
  }
  try {
    const songs = await songInbox(50);
    // The first load after sign-in only fills the inbox; later ones toast what's new.
    const fresh = first ? [] : songs.filter((s) => !seen.has(s.id) && !s.read_at);
    first = false;
    seen = new Set(songs.map((s) => s.id));
    set({
      songs,
      unread: songs.filter((s) => !s.read_at).length,
      arrivals: [...fresh, ...state.arrivals].slice(0, 5),
      loaded: true,
    });
  } catch {
    // Offline or signed out mid-request; the next check tries again.
  }
}

export function dismissArrival(id: string): void {
  set({ arrivals: state.arrivals.filter((s) => s.id !== id) });
}

function tick() {
  if (document.visibilityState === "visible") void refreshInbox();
}

/** Subscribe to the inbox; the first subscriber starts the checks, the last stops them. */
export function useSongInbox(): InboxState {
  useEffect(() => {
    users += 1;
    if (users === 1) {
      void refreshInbox();
      timer = window.setInterval(tick, POLL_MS);
      document.addEventListener("visibilitychange", tick);
    }
    // A token refresh fires this too; only a different account starts the inbox over.
    let account = jlAccountContext()?.userId ?? null;
    const unsubscribe = subscribeJlSession(() => {
      const next = jlAccountContext()?.userId ?? null;
      if (next === account) return;
      account = next;
      first = true;
      void refreshInbox();
    });
    return () => {
      unsubscribe();
      users -= 1;
      if (users === 0) {
        window.clearInterval(timer);
        document.removeEventListener("visibilitychange", tick);
      }
    };
  }, []);
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    inboxState,
    inboxState,
  );
}

/** Ask the Music Hub to open a tab (the friends tab from a toast, say). */
export const MUSIC_TAB_EVENT = "jl-music-open-tab";
let pendingTab: string | null = null;
export function requestMusicTab(tab: string): void {
  pendingTab = tab;
  window.dispatchEvent(new Event(MUSIC_TAB_EVENT));
}
export function takeMusicTabRequest(): string | null {
  const tab = pendingTab;
  pendingTab = null;
  return tab;
}
