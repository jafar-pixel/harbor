import { useSyncExternalStore } from "react";
import type { IptvChannel } from "./types";

/**
 * Today's picks: the game channels the viewer starred for today. Sports event channels carry a
 * different game every day, so the list belongs to the day it was made and starts empty the next.
 * Kept on this device.
 */
export type TodayPick = { channel: IptvChannel; title: string };

type Stored = { day: string; picks: TodayPick[] };

const KEY = "jl.iptv.today-picks.v1";
const listeners = new Set<() => void>();

/** The local calendar day, so the list turns over at the viewer's midnight. */
export function localDay(at: Date = new Date()): string {
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
}

export function picksForDay(stored: Stored | null, day: string): TodayPick[] {
  return stored && stored.day === day && Array.isArray(stored.picks) ? stored.picks : [];
}

function read(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored | null;
  } catch {
    return null;
  }
}

let cache: { day: string; picks: TodayPick[] } | null = null;

function snapshot(): TodayPick[] {
  const day = localDay();
  if (!cache || cache.day !== day) cache = { day, picks: picksForDay(read(), day) };
  return cache.picks;
}

function write(picks: TodayPick[]) {
  const day = localDay();
  cache = { day, picks };
  try {
    localStorage.setItem(KEY, JSON.stringify({ day, picks }));
  } catch {
    /* storage unavailable: the picks last for this visit */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function isPicked(picks: TodayPick[], channelId: string): boolean {
  return picks.some((p) => p.channel.id === channelId);
}

export function toggleTodayPick(channel: IptvChannel, title: string) {
  const picks = snapshot();
  write(
    isPicked(picks, channel.id)
      ? picks.filter((p) => p.channel.id !== channel.id)
      : [...picks, { channel, title }],
  );
}

export function useTodayPicks(): TodayPick[] {
  return useSyncExternalStore(subscribe, snapshot);
}
