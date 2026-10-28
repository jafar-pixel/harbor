import { useSyncExternalStore } from "react";
import { addSongs, createPlaylist, listPlaylists } from "./automix/playlists";
import { youtubeCanEdit } from "./youtube-web/auth";

/**
 * Songs you found with song ID while watching, saved for after the movie or show. They're kept
 * on this device and, when YouTube is connected with permission to edit, also added to a
 * "Found in JL Media Vision" playlist on your YouTube account.
 */

export type FoundSong = {
  title: string;
  artist: string;
  album: string;
  art: string | null;
  /** What was playing when it was found. */
  heardIn: string | null;
  at: number;
  /** Also on the YouTube playlist. */
  onYouTube: boolean;
};

export type SaveResult = { youtube: "added" | "not-connected" | "failed" };

const KEY = "jl.music.found.v1";
const MAX = 200;
export const YOUTUBE_PLAYLIST_NAME = "Found in JL Media Vision";

let cache: FoundSong[] | null = null;
const listeners = new Set<() => void>();

function load(): FoundSong[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    cache = Array.isArray(v) ? (v as FoundSong[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: FoundSong[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: kept for this visit */
  }
  for (const fn of listeners) fn();
}

const same = (a: { title: string; artist: string }, b: { title: string; artist: string }) =>
  a.title.toLowerCase() === b.title.toLowerCase() &&
  a.artist.toLowerCase() === b.artist.toLowerCase();

let playlistId: Promise<string> | null = null;
async function youtubePlaylist(): Promise<string> {
  playlistId ??= (async () => {
    const mine = await listPlaylists("youtube");
    const found = mine.find((l) => l.mine && l.name === YOUTUBE_PLAYLIST_NAME);
    return (found ?? (await createPlaylist("youtube", YOUTUBE_PLAYLIST_NAME))).id;
  })().catch((e: unknown) => {
    playlistId = null;
    throw e;
  });
  return playlistId;
}

/** Save a found song for later, and to the YouTube playlist when that's possible. */
export async function saveFoundSong(
  song: { title: string; artist: string; album?: string; art?: string | null },
  heardIn: string | null = null,
): Promise<SaveResult> {
  const entry: FoundSong = {
    title: song.title,
    artist: song.artist,
    album: song.album ?? "",
    art: song.art ?? null,
    heardIn,
    at: Date.now(),
    onYouTube: false,
  };
  write([entry, ...load().filter((s) => !same(s, entry))].slice(0, MAX));
  if (!youtubeCanEdit()) return { youtube: "not-connected" };
  try {
    const id = await youtubePlaylist();
    const added = await addSongs(
      { service: "youtube", id, name: YOUTUBE_PLAYLIST_NAME, image: null, count: 0, mine: true },
      [{ title: song.title, artist: song.artist, image: song.art ?? null }],
    );
    if (!added) return { youtube: "failed" };
    write(load().map((s) => (same(s, entry) ? { ...s, onYouTube: true } : s)));
    return { youtube: "added" };
  } catch {
    return { youtube: "failed" };
  }
}

export function removeFoundSong(song: FoundSong): void {
  write(load().filter((s) => !same(s, song)));
}

const snapshot = () => load();

export function useFoundSongs(): FoundSong[] {
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
