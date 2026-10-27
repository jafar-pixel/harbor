import { call } from "../dj/api";
import { readMusicPreference, writeMusicPreference } from "../preferences";

/**
 * Tempo, key and energy for songs, from the AI DJ's analysis (music-dj, "analyze"). Answers are
 * kept on this device so a playlist is analysed once.
 */

export type SongFacts = { bpm?: number; key?: string; energy?: number };
type Song = { artist: string; title: string };

const CACHE_KEY = "jl.music.analysis.v1";
const MAX_CACHED = 3000;

const id = (s: Song) => `${s.artist} - ${s.title}`.toLowerCase().trim();

function readCache(): Record<string, SongFacts> {
  try {
    const v: unknown = JSON.parse(readMusicPreference(CACHE_KEY) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, SongFacts>) : {};
  } catch {
    return {};
  }
}

let cache = readCache();

function save() {
  const entries = Object.entries(cache);
  if (entries.length > MAX_CACHED) cache = Object.fromEntries(entries.slice(-MAX_CACHED));
  writeMusicPreference(CACHE_KEY, JSON.stringify(cache));
}

/** What's known about a song already, without asking. */
export const knownFacts = (song: Song): SongFacts | null => cache[id(song)] ?? null;

/** Facts for every song (asks the DJ about the ones not seen before, 50 at a time). */
export async function analyzeSongs(songs: Song[]): Promise<Map<string, SongFacts>> {
  const wanted = songs.filter((s) => s.title && !cache[id(s)]);
  const unique = [...new Map(wanted.map((s) => [id(s), s])).values()];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const out = await call<{ songs: (Song & SongFacts)[] }>("music-dj", {
      analyze: batch.map((s) => ({ artist: s.artist, title: s.title })),
    });
    for (const s of out.songs ?? []) cache[id(s)] = { bpm: s.bpm, key: s.key, energy: s.energy };
    // Songs the DJ couldn't place still count as asked.
    for (const s of batch) cache[id(s)] ??= {};
    save();
  }
  return new Map(songs.map((s) => [id(s), cache[id(s)] ?? {}]));
}

export const factsKey = id;
