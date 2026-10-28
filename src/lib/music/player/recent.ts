import { useSyncExternalStore } from "react";
import type { PlayerTrack } from "./types";

/** Songs the shared player played lately, newest first, for Continue. */
export type RecentSong = Omit<PlayerTrack, "key"> & { at: number };

const KEY = "jl.music.recent.v1";
const MAX = 12;

let cache: RecentSong[] | null = null;
const listeners = new Set<() => void>();

function load(): RecentSong[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    cache = Array.isArray(v) ? (v as RecentSong[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

const same = (a: Omit<PlayerTrack, "key">, b: Omit<PlayerTrack, "key">) =>
  a.title === b.title && a.artist === b.artist;

export function recordRecentSong(track: PlayerTrack): void {
  // A file picked from this computer can't be played again from a later visit.
  if (track.source === "file") return;
  const { key: _key, ...song } = track;
  const next = [{ ...song, at: Date.now() }, ...load().filter((s) => !same(s, song))].slice(0, MAX);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked */
  }
  for (const fn of listeners) fn();
}

const snapshot = () => load();

export function useRecentSongs(): RecentSong[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    snapshot,
    snapshot,
  );
}
