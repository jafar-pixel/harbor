import { useSyncExternalStore } from "react";
import type { AutoSong } from "../automix/playlists";

/**
 * The playlist being built in DJ Studio: songs added from the playlist mixer (or everything
 * that went on a deck), kept while you move around the app until it is saved to YouTube Music
 * or Spotify. Songs are matched by artist and title, so the same song isn't added twice.
 */

type State = { name: string; songs: AutoSong[]; played: AutoSong[] };

let state: State = { name: "", songs: [], played: [] };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

export const songKey = (s: { artist: string; title: string }) =>
  `${s.artist}\u0000${s.title}`.toLowerCase();

const without = (list: AutoSong[], add: AutoSong[]) => {
  const seen = new Set(list.map(songKey));
  return add.filter((s) => {
    const k = songKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export function useSetlist(): State {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

export const setlistHas = (s: AutoSong) => state.songs.some((x) => songKey(x) === songKey(s));
export const addToSetlist = (...songs: AutoSong[]) =>
  set({ songs: [...state.songs, ...without(state.songs, songs)] });
export const removeFromSetlist = (s: AutoSong) =>
  set({ songs: state.songs.filter((x) => songKey(x) !== songKey(s)) });
export function moveInSetlist(from: number, to: number) {
  const songs = state.songs.slice();
  const [song] = songs.splice(from, 1);
  if (!song) return;
  songs.splice(Math.max(0, Math.min(to, songs.length)), 0, song);
  set({ songs });
}
export const renameSetlist = (name: string) => set({ name });
export const clearSetlist = () => set({ songs: [], name: "" });

/** A song went on a deck; "Add what you played" takes these. */
export const notePlayed = (s: AutoSong) =>
  set({ played: [...state.played, ...without(state.played, [s])] });
