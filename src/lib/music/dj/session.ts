import { useSyncExternalStore } from "react";
import { readMusicPreference, writeMusicPreference } from "../preferences";
import { resolveStyles, seedArtists } from "../tastes/styles";
import { askDj, searchVideos, type DjSet } from "./api";
import { pickVideo, songKey, songQuery, type DjSong, type VideoResult, type Vibe } from "./vibes";

/**
 * One AI DJ session: the vibe, the set the DJ picked, which song is on, and the video found for
 * each song. The decks (two YouTube players) live in the view and follow `index`; this store
 * finds videos ahead of time and asks the DJ for more before the set runs out.
 */

export type DjTrack = DjSong & {
  video?: VideoResult | null;
  /** Videos already tried and refused (e.g. not embeddable), so a retry picks another. */
  skipped?: string[];
};

export type DjState = {
  status: "idle" | "thinking" | "ready" | "error";
  error: string | null;
  vibe: Vibe | null;
  intro: string;
  tracks: DjTrack[];
  index: number;
  discover: DjSong[];
  colors: [string, string] | null;
  sounds: string[];
  liked: DjSong[];
};

const LIKED_KEY = "harbor.music.dj.liked.v1";
const MORE_WHEN_LEFT = 3;

function readLiked(): DjSong[] {
  try {
    const v: unknown = JSON.parse(readMusicPreference(LIKED_KEY) ?? "[]");
    return Array.isArray(v)
      ? v
          .filter(
            (s): s is DjSong => !!s && typeof s.artist === "string" && typeof s.title === "string",
          )
          .slice(0, 500)
      : [];
  } catch {
    return [];
  }
}

let state: DjState = {
  status: "idle",
  error: null,
  vibe: null,
  intro: "",
  tracks: [],
  index: 0,
  discover: [],
  colors: null,
  sounds: [],
  liked: readLiked(),
};
const listeners = new Set<() => void>();
let generation = 0;
let extending = false;

function set(next: Partial<DjState>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export const djState = () => state;
export function useDj(): DjState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    djState,
    djState,
  );
}

function context(styleKeys: readonly string[]) {
  return {
    styles: resolveStyles(styleKeys).map((r) => `${r.genre.name}: ${r.name}`),
    seeds: [
      ...new Set([...seedArtists(styleKeys, 20), ...state.liked.slice(0, 10).map((s) => s.artist)]),
    ],
  };
}

function apply(set_: DjSet, keep: DjTrack[]) {
  const known = new Set(keep.map(songKey));
  const fresh = set_.tracks.filter((t) => !known.has(songKey(t)));
  set({
    status: "ready",
    error: null,
    intro: set_.intro || state.intro,
    tracks: [...keep, ...fresh],
    discover: set_.discover.length ? set_.discover : state.discover,
    colors: set_.colors ?? state.colors,
    sounds: set_.sounds,
  });
}

/** Start a set for a vibe (a preset, or the listener's own words). */
export async function startDj(vibe: Vibe, styleKeys: readonly string[]): Promise<void> {
  const run = ++generation;
  set({
    status: "thinking",
    error: null,
    vibe,
    intro: "",
    tracks: [],
    index: 0,
    discover: [],
    colors: vibe.colors,
    sounds: [],
  });
  try {
    const result = await askDj({ vibe: vibe.prompt, ...context(styleKeys), count: 12 });
    if (run !== generation) return;
    if (!result.tracks.length) throw new Error("The DJ came back empty. Try another vibe.");
    apply(result, []);
    void resolveAhead();
  } catch (error) {
    if (run === generation)
      set({ status: "error", error: error instanceof Error ? error.message : String(error) });
  }
}

/** "More like this", "switch to 90s": replaces what's coming up, keeps what's played. */
export async function requestDj(request: string, styleKeys: readonly string[]): Promise<void> {
  if (!state.vibe || !request.trim()) return;
  const run = ++generation;
  const played = state.tracks.slice(0, state.index + 1);
  set({ status: "thinking", error: null });
  try {
    const result = await askDj({
      vibe: state.vibe.prompt,
      request,
      ...context(styleKeys),
      avoid: state.tracks.map(songKey),
      recent: played.slice(-8).map(songKey),
      count: 10,
    });
    if (run !== generation) return;
    apply(result, played);
    void resolveAhead();
  } catch (error) {
    if (run === generation)
      set({ status: "ready", error: error instanceof Error ? error.message : String(error) });
  }
}

/** Ask for more before the set runs out, keeping the same vibe. */
async function extend(styleKeys: readonly string[]) {
  if (extending || !state.vibe) return;
  extending = true;
  const run = generation;
  try {
    const result = await askDj({
      vibe: state.vibe.prompt,
      request: "Keep the set going in the same flow.",
      ...context(styleKeys),
      avoid: state.tracks.map(songKey),
      recent: state.tracks.slice(Math.max(0, state.index - 6), state.index + 1).map(songKey),
      count: 8,
    });
    if (run === generation) apply(result, state.tracks);
  } catch {
    // The current set keeps playing; the next advance tries again.
  } finally {
    extending = false;
  }
}

async function resolveTrack(i: number): Promise<void> {
  const track = state.tracks[i];
  if (!track || track.video !== undefined) return;
  const run = generation;
  try {
    const results = await searchVideos(songQuery(track));
    const usable = results.filter((r) => !track.skipped?.includes(r.id));
    const video = pickVideo(track, usable);
    if (run !== generation) return;
    const tracks = [...state.tracks];
    const at = tracks.findIndex((t) => songKey(t) === songKey(track));
    if (at >= 0) tracks[at] = { ...tracks[at], video };
    set({ tracks });
  } catch (error) {
    if (run === generation) set({ error: error instanceof Error ? error.message : String(error) });
  }
}

/** Find videos for the song on and the next two, so the crossfade has its next deck ready. */
export async function resolveAhead(): Promise<void> {
  for (let i = state.index; i < Math.min(state.tracks.length, state.index + 3); i++)
    await resolveTrack(i);
}

/** Move to song `index` (next, previous or a tap in the list). */
export function goTo(index: number, styleKeys: readonly string[] = []): void {
  if (index < 0 || index >= state.tracks.length) return;
  set({ index });
  void resolveAhead();
  if (state.tracks.length - index <= MORE_WHEN_LEFT) void extend(styleKeys);
}

/** The video for the song on couldn't play here; try another upload, else move on. */
export function videoFailed(index: number): void {
  const track = state.tracks[index];
  if (!track?.video) return;
  const tracks = [...state.tracks];
  tracks[index] = {
    ...track,
    skipped: [...(track.skipped ?? []), track.video.id],
    video: undefined,
  };
  set({ tracks });
  void resolveTrack(index).then(() => {
    if (state.tracks[index]?.video === null && state.index === index) goTo(index + 1);
  });
}

export function isLiked(song: DjSong): boolean {
  return state.liked.some((s) => songKey(s) === songKey(song));
}

/** Keep a song (or a new artist's starter song) in "My DJ finds". */
export function toggleLike(song: DjSong): void {
  const liked = isLiked(song)
    ? state.liked.filter((s) => songKey(s) !== songKey(song))
    : [{ artist: song.artist, title: song.title, why: song.why }, ...state.liked].slice(0, 500);
  set({ liked });
  writeMusicPreference(LIKED_KEY, JSON.stringify(liked));
}

/** Put a song next in the set (from "Discover" or "My DJ finds"). */
export function playNext(song: DjSong): void {
  const key = songKey(song);
  const tracks = state.tracks.filter((t, i) => i <= state.index || songKey(t) !== key);
  tracks.splice(state.index + 1, 0, { artist: song.artist, title: song.title, why: song.why });
  set({ tracks });
  void resolveAhead();
}

export function stopDj(): void {
  generation++;
  set({ status: "idle", vibe: null, tracks: [], index: 0, intro: "", discover: [], error: null });
}
