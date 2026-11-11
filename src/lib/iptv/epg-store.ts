import { fetchAndParseXmltv, indexProgramsByChannel, type ProgramFilter } from "./xmltv";
import { readIptvCache, writeIptvCache } from "./persistent-cache";
import type { EpgChannelMeta, EpgIndex, EpgProgram } from "./types";

const TTL_MS = 60 * 60 * 1000;
const DISK_TTL_MS = 12 * 60 * 60 * 1000;
const PROGRESS_PUBLISH_MS = 300;

/**
 * The part of a guide that is kept: the guide shows 12 hours back and 36 ahead
 * (live/guide/guide-utils.ts), so programs outside 14 hours back to 40 ahead are dropped as the
 * guide is read. A provider's 7-day guide for thousands of channels held whole ran the TV app's
 * page out of memory (V8 "Ineffective mark-compacts near heap limit" at about 720 MB on a Shield).
 */
const KEEP_BACK_MS = 14 * 60 * 60 * 1000;
const KEEP_AHEAD_MS = 40 * 60 * 60 * 1000;

export function guideWindow(nowMs = Date.now()): ProgramFilter {
  const from = nowMs - KEEP_BACK_MS;
  const to = nowMs + KEEP_AHEAD_MS;
  return (p) => p.endMs > from && p.startMs < to;
}

/** A saved guide trimmed to the window, so an old copy from disk doesn't bring its other days back. */
function trimIndex(value: EpgIndex, keep: ProgramFilter): EpgIndex {
  const byChannel = new Map<string, EpgProgram[]>();
  for (const [id, list] of value.byChannel) {
    const kept = list.filter(keep);
    if (kept.length) byChannel.set(id, kept);
  }
  return { ...value, byChannel };
}

const cache = new Map<string, EpgIndex>();
const inflight = new Map<string, Promise<EpgIndex>>();
const listeners = new Set<() => void>();

let notifyScheduled = false;
function notify() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    listeners.forEach((l) => l());
  });
}

export function subscribeEpg(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getCachedEpg(playlistId: string): EpgIndex | null {
  return cache.get(playlistId) ?? null;
}

export function clearEpg(playlistId?: string) {
  if (playlistId) {
    cache.delete(playlistId);
    inflight.delete(playlistId);
  } else {
    cache.clear();
    inflight.clear();
  }
  notify();
}

async function restoreFromDisk(playlistId: string, signature: string) {
  const entry = await readIptvCache<EpgIndex>("epg", playlistId);
  if (!entry) return;
  if (entry.sourceSignature !== signature) return;
  if (Date.now() - entry.savedAt > DISK_TTL_MS) return;
  if (!entry.value || !(entry.value.byChannel instanceof Map)) return;
  const value = trimIndex(entry.value, guideWindow());
  if (value.byChannel.size === 0) return;
  const current = cache.get(playlistId);
  if (current && current.byChannel.size >= value.byChannel.size) return;
  cache.set(playlistId, value);
  notify();
}

export async function loadEpg(params: {
  playlistId: string;
  urls: string[];
  force?: boolean;
}): Promise<EpgIndex> {
  const { playlistId, urls, force } = params;
  const existing = cache.get(playlistId);
  if (!force && existing && Date.now() - existing.fetchedAt < TTL_MS) {
    return existing;
  }
  const pending = inflight.get(playlistId);
  if (pending && !force) return pending;
  const signature = urls.join("|");
  let liveByChannel: Map<string, EpgProgram[]> | null = null;
  let lastPublish = 0;
  const onProgress = (delta: EpgProgram[], channelMeta: Map<string, EpgChannelMeta>) => {
    if (delta.length === 0) return;
    if (inflight.get(playlistId) !== promise) return;
    if (!liveByChannel) {
      const prev = cache.get(playlistId);
      liveByChannel = prev ? new Map(prev.byChannel) : new Map<string, EpgProgram[]>();
    }
    const byChannel = liveByChannel;
    const touched = new Set<string>();
    for (const p of delta) {
      let arr = byChannel.get(p.channelTvgId);
      if (!arr) {
        arr = [];
        byChannel.set(p.channelTvgId, arr);
      }
      arr.push(p);
      touched.add(p.channelTvgId);
    }
    for (const id of touched) byChannel.get(id)!.sort((a, b) => a.startMs - b.startMs);
    const now = Date.now();
    if (now - lastPublish < PROGRESS_PUBLISH_MS) return;
    lastPublish = now;
    cache.set(playlistId, { byChannel, channelMeta, fetchedAt: now });
    notify();
  };
  const promise: Promise<EpgIndex> = doFetchWithFallback(urls, onProgress).then((idx) => {
    if (inflight.get(playlistId) === promise) {
      cache.set(playlistId, idx);
      notify();
    }
    void writeIptvCache<EpgIndex>("epg", playlistId, {
      sourceSignature: signature,
      savedAt: Date.now(),
      value: idx,
    });
    return idx;
  });
  inflight.set(playlistId, promise);
  if (!existing) void restoreFromDisk(playlistId, signature);
  try {
    return await promise;
  } finally {
    if (inflight.get(playlistId) === promise) inflight.delete(playlistId);
  }
}

async function doFetchWithFallback(
  urls: string[],
  onProgress?: (programs: EpgProgram[], channelMeta: Map<string, EpgChannelMeta>) => void,
): Promise<EpgIndex> {
  if (urls.length === 0) throw new Error("No EPG URL available for this playlist");
  let lastErr: unknown = null;
  let lastMeta: Map<string, EpgChannelMeta> | undefined;
  for (const url of urls) {
    try {
      const { programs, channelMeta } = await fetchAndParseXmltv(url, onProgress, guideWindow());
      if (channelMeta.size > 0) lastMeta = channelMeta;
      if (programs.length === 0) {
        lastErr = new Error("EPG endpoint returned no programs");
        console.warn(`[epg] empty result from ${url}`);
        continue;
      }
      return {
        byChannel: indexProgramsByChannel(programs),
        channelMeta,
        fetchedAt: Date.now(),
      };
    } catch (e) {
      lastErr = e;
      console.warn(`[epg] fetch failed for ${url}:`, e);
    }
  }
  if (lastMeta && lastMeta.size > 0) {
    return { byChannel: new Map(), channelMeta: lastMeta, fetchedAt: Date.now() };
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
