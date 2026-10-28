import { useSyncExternalStore } from "react";
import type { IptvChannel } from "@/lib/iptv/types";

/**
 * Games you started watching in the Sports Hub, so Continue can bring you back to them. Each keeps
 * what played (the matched channel, or a stream attached to the game) and the teams' logos.
 */
export type RecentGame = {
  gameId: string;
  league: string;
  label: string;
  logos: string[];
  /** The game's own artwork when the league publishes one. */
  art: string | null;
  startMs: number;
  channel?: IptvChannel;
  /** A stream attached to the game (the Sports Hub's AttachedStream). */
  stream?: {
    url: string;
    kind: "hls" | "dash" | "file";
    headers?: Record<string, string>;
    page: string;
    title: string;
    poster: string;
  };
  at: number;
};

const KEY = "jl.sports.recent.v1";
const MAX = 12;
/** A game drops off Continue once it's this old. */
const KEEP_MS = 2 * 24 * 60 * 60 * 1000;

let cache: RecentGame[] | null = null;
const listeners = new Set<() => void>();

function load(): RecentGame[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    cache = Array.isArray(v) ? (v as RecentGame[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function recordGameWatch(entry: Omit<RecentGame, "at">): void {
  const next = [
    { ...entry, at: Date.now() },
    ...load().filter((g) => g.gameId !== entry.gameId),
  ].slice(0, MAX);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: kept for this visit */
  }
  for (const fn of listeners) fn();
}

export function removeRecentGame(gameId: string): void {
  recordRemoval((g) => g.gameId !== gameId);
}

function recordRemoval(keep: (g: RecentGame) => boolean) {
  cache = load().filter(keep);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage blocked */
  }
  for (const fn of listeners) fn();
}

const snapshot = () => load();

export function useRecentGames(): RecentGame[] {
  const all = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    snapshot,
    snapshot,
  );
  const now = Date.now();
  return all.filter((g) => now - g.at < KEEP_MS);
}
