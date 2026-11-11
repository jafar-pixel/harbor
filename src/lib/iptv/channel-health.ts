import { useSyncExternalStore } from "react";

/**
 * Whether each live channel actually plays on this device, learnt from real plays: a channel
 * that failed and hasn't worked since is "failing", and Sports, Live TV and the player's lists
 * put it last instead of picking it again. Kept per channel URL, so a provider renaming a channel
 * keeps its record. Plain module with localStorage, no network.
 */

const KEY = "jl.iptv.health.v1";
const MAX_ENTRIES = 3000;
/** A failure this old no longer counts: providers fix feeds, and events come and go. */
const FAIL_TTL_MS = 3 * 24 * 60 * 60_000;

export type ChannelHealthEntry = {
  ok: number;
  fail: number;
  lastOkAt: number;
  lastFailAt: number;
};

export type ChannelHealth = "working" | "failing" | "unknown";

let cache: Record<string, ChannelHealthEntry> | null = null;
const listeners = new Set<() => void>();
let version = 0;

function load(): Record<string, ChannelHealthEntry> {
  if (cache) return cache;
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    cache =
      parsed && typeof parsed === "object" ? (parsed as Record<string, ChannelHealthEntry>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function save(map: Record<string, ChannelHealthEntry>): void {
  let next = map;
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    const latest = (e: ChannelHealthEntry) => Math.max(e.lastOkAt, e.lastFailAt);
    keys.sort((a, b) => latest(map[b]) - latest(map[a]));
    next = Object.fromEntries(keys.slice(0, MAX_ENTRIES).map((k) => [k, map[k]]));
  }
  cache = next;
  version += 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the record lasts for this session */
  }
  for (const l of listeners) l();
}

/** The channel's stream address without its per-session token query, so a fresh token is the same channel. */
export function healthKey(url: string): string {
  return url.split(/[?#]/)[0].trim();
}

/** Records one real play: it started (ok) or failed before showing a picture. */
export function recordChannelResult(url: string, ok: boolean, now = Date.now()): void {
  if (!url) return;
  const map = { ...load() };
  const key = healthKey(url);
  const prev = map[key] ?? { ok: 0, fail: 0, lastOkAt: 0, lastFailAt: 0 };
  map[key] = ok
    ? { ...prev, ok: prev.ok + 1, lastOkAt: now }
    : { ...prev, fail: prev.fail + 1, lastFailAt: now };
  save(map);
}

export function healthOf(entry: ChannelHealthEntry | undefined, now = Date.now()): ChannelHealth {
  if (!entry) return "unknown";
  if (entry.lastFailAt > entry.lastOkAt && now - entry.lastFailAt < FAIL_TTL_MS) return "failing";
  if (entry.lastOkAt > 0) return "working";
  return "unknown";
}

export function channelHealth(url: string, now = Date.now()): ChannelHealth {
  return healthOf(load()[healthKey(url)], now);
}

/** Changes whenever any channel's record changes; game pickers key their caches on it. */
export function channelHealthVersion(): number {
  return version;
}

/** Re-renders when any channel's record changes. */
export function useChannelHealthVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

/** Test hook: forget everything. */
export function resetChannelHealth(): void {
  cache = {};
  version += 1;
}
