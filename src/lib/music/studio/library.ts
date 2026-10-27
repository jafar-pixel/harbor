import { useSyncExternalStore } from "react";
import { beatGrid, musicalKey, waveform, type MusicalKey } from "./analysis";
import type { StudioTrack } from "./deck";
import { readTags } from "./tags";

/**
 * The DJ Studio's crate: music files added this session, the queue and the history of what was
 * loaded on a deck. Decoded audio is kept for the most recent tracks only.
 */

export type CrateItem = {
  id: string;
  title: string;
  artist: string;
  /** A local file, or a URL the app can fetch with CORS (a debrid stream). */
  file?: File;
  url?: string;
  bpm?: number;
  duration?: number;
  /** Cover from the file's own tags (an object URL). */
  art?: string;
  key?: MusicalKey | null;
};

const AUDIO_RE = /\.(mp3|m4a|aac|flac|wav|ogg|opus|aiff?|alac|wma)$/i;
const KEEP_DECODED = 8;

type State = {
  crate: CrateItem[];
  queue: string[];
  history: string[];
  loading: Record<string, boolean>;
};

let state: State = { crate: [], queue: [], history: [], loading: {} };
const listeners = new Set<() => void>();
const decoded = new Map<string, StudioTrack>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

export function useCrate(): State {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

/** "Artist - Title.mp3" (or "01 Artist - Title") into artist and title. */
export function titleFromName(name: string): { artist: string; title: string } {
  const base = name
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/_/g, " ")
    .replace(/^\s*\d{1,3}[\s.\-_)]+/, "")
    .trim();
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2)
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  return { artist: "", title: base };
}

export function isAudioName(name: string): boolean {
  return AUDIO_RE.test(name);
}

let seq = 0;

export function addFiles(files: Iterable<File>): number {
  const added: CrateItem[] = [];
  const known = new Set(state.crate.map((c) => `${c.title}|${c.artist}|${c.file?.size ?? ""}`));
  for (const file of files) {
    if (!file.type.startsWith("audio/") && !isAudioName(file.name)) continue;
    const meta = titleFromName(file.name);
    const key = `${meta.title}|${meta.artist}|${file.size}`;
    if (known.has(key)) continue;
    known.add(key);
    added.push({ id: `f${++seq}`, ...meta, file });
  }
  if (added.length) {
    set({ crate: [...state.crate, ...added] });
    void tagAll(added);
  }
  return added.length;
}

/** Real title, artist and cover from each file's tags, a few at a time. */
async function tagAll(items: CrateItem[]) {
  for (const item of items) {
    if (!item.file) continue;
    const tags = await readTags(item.file).catch(
      () => ({}) as Awaited<ReturnType<typeof readTags>>,
    );
    if (!tags.title && !tags.artist && !tags.cover) continue;
    const art = tags.cover ? URL.createObjectURL(tags.cover) : undefined;
    set({
      crate: state.crate.map((c) =>
        c.id === item.id
          ? {
              ...c,
              title: tags.title || c.title,
              artist: tags.artist || c.artist,
              ...(art ? { art } : {}),
            }
          : c,
      ),
    });
  }
}

export function addUrl(url: string, title: string, artist = ""): CrateItem {
  const existing = state.crate.find((c) => c.url === url);
  if (existing) return existing;
  const item: CrateItem = { id: `u${++seq}`, title, artist, url };
  set({ crate: [...state.crate, item] });
  return item;
}

export function crateItem(id: string): CrateItem | undefined {
  return state.crate.find((c) => c.id === id);
}

export function enqueue(id: string) {
  if (!state.queue.includes(id)) set({ queue: [...state.queue, id] });
}

export function dequeue(id: string) {
  set({ queue: state.queue.filter((q) => q !== id) });
}

/** Decode and analyse a crate item (cached), ready for a deck. */
export async function prepare(ctx: AudioContext, id: string): Promise<StudioTrack> {
  const hit = decoded.get(id);
  if (hit) return hit;
  const item = crateItem(id);
  if (!item) throw new Error("That track is no longer in the crate.");
  set({ loading: { ...state.loading, [id]: true } });
  try {
    const bytes = item.file
      ? await item.file.arrayBuffer()
      : await fetch(item.url!).then((r) => {
          if (!r.ok) throw new Error(`The track couldn't be downloaded (${r.status}).`);
          return r.arrayBuffer();
        });
    const buffer = await ctx.decodeAudioData(bytes);
    // Let the UI paint before the analysis pass.
    await new Promise((r) => setTimeout(r, 0));
    const track: StudioTrack = {
      id,
      title: item.title,
      artist: item.artist,
      art: item.art,
      buffer,
      grid: beatGrid(buffer),
      wave: waveform(buffer),
      key: musicalKey(buffer),
    };
    decoded.set(id, track);
    while (decoded.size > KEEP_DECODED) decoded.delete(decoded.keys().next().value!);
    set({
      crate: state.crate.map((c) =>
        c.id === id ? { ...c, bpm: track.grid.bpm, duration: buffer.duration, key: track.key } : c,
      ),
      history: [id, ...state.history.filter((h) => h !== id)].slice(0, 100),
      queue: state.queue.filter((q) => q !== id),
    });
    return track;
  } finally {
    const { [id]: _, ...rest } = state.loading;
    set({ loading: rest });
  }
}
