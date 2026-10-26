import { useEffect, useSyncExternalStore } from "react";
import { spotifyWebState } from "../spotify-web/auth";
import { spotifyCover } from "../spotify-web/api";
import { call } from "./api";
import type { DjSong } from "./vibes";

/**
 * Album covers for the AI DJ's posters. The listener's own Spotify answers first when it's
 * connected on the web; otherwise JL's music-art function (iTunes covers, cached for everyone).
 * The YouTube thumbnail is the poster's fallback when neither has the song.
 */

export type SongArt = { art: string | null; album?: string; year?: string; genre?: string };

const art = new Map<string, SongArt>();
const asked = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const keyOf = (s: Pick<DjSong, "artist" | "title">) =>
  `${s.artist.toLowerCase().replace(/\s+/g, " ").trim()}|${s.title.toLowerCase().replace(/\s+/g, " ").trim()}`;

function notify() {
  version++;
  for (const fn of listeners) fn();
}

export function songArt(song: Pick<DjSong, "artist" | "title">): SongArt | undefined {
  return art.get(keyOf(song));
}

async function load(songs: Pick<DjSong, "artist" | "title">[]) {
  const wanted = songs.filter((s) => {
    const k = keyOf(s);
    if (asked.has(k)) return false;
    asked.add(k);
    return true;
  });
  if (!wanted.length) return;
  let rest = wanted;
  if (spotifyWebState().connected) {
    const found = await Promise.all(
      wanted.map((s) => spotifyCover(s.artist, s.title).catch(() => null)),
    );
    found.forEach((url, i) => url && art.set(keyOf(wanted[i]), { art: url }));
    rest = wanted.filter((_, i) => !found[i]);
    notify();
  }
  for (let i = 0; i < rest.length; i += 24) {
    const batch = rest.slice(i, i + 24);
    try {
      const { results } = await call<{
        results: Record<string, { art: string; album: string; year: string; genre: string } | null>;
      }>("music-art", { items: batch.map((s) => ({ artist: s.artist, title: s.title })) });
      for (const s of batch) {
        const hit = results[`art:${keyOf(s)}`];
        if (hit) art.set(keyOf(s), hit);
        else if (hit === null) art.set(keyOf(s), { art: null });
        else asked.delete(keyOf(s));
      }
    } catch {
      for (const s of batch) asked.delete(keyOf(s));
    }
    notify();
  }
}

/** Covers for these songs; re-renders as they arrive. */
export function useSongArt(
  songs: Pick<DjSong, "artist" | "title">[],
): (song: Pick<DjSong, "artist" | "title">) => SongArt | undefined {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
    () => version,
  );
  const signature = songs.map(keyOf).join("\n");
  useEffect(() => {
    if (signature) void load(songs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return songArt;
}
