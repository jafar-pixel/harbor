/**
 * Black Cinema hub data: the titles in public.black_cinema_titles (JL Vision's Supabase), read with
 * the app's public key (the table is readable by everyone) and kept on the device so the hub opens
 * at once and works offline; a fresh copy is fetched in the background after a few hours.
 */
import { useEffect, useState } from "react";
import type { Meta } from "./cinemeta";
import { isBlackHistoryMonth, onYourIptv, type BlackCinemaTitle } from "./black-cinema-core";
import { movieMeta, seriesMeta } from "./providers/tmdb/tmdb-meta-mappers";

const STORE = "jl.blackCinema.titles.v1";
const FRESH_MS = 6 * 60 * 60 * 1000;
const COLUMNS = [
  "id",
  "title",
  "release_year",
  "media_type",
  "categories",
  "networks",
  "franchise",
  "genres",
  "tmdb_id",
  "imdb_id",
  "poster_path",
  "backdrop_path",
  "overview",
  "release_date",
  "popularity",
  "vote_average",
  "streaming_providers",
].join(",");

type Stored = { at: number; titles: BlackCinemaTitle[] };

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORE);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    return parsed && Array.isArray(parsed.titles) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(titles: BlackCinemaTitle[]): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ at: Date.now(), titles }));
  } catch {}
}

async function fetchTitles(): Promise<BlackCinemaTitle[]> {
  const url = (import.meta.env.VITE_JL_SUPABASE_URL as string | undefined) || "";
  const key = (import.meta.env.VITE_JL_SUPABASE_ANON_KEY as string | undefined) || "";
  if (!url || !key) return [];
  // Titles found on TMDB: the ones with artwork and ids to open and play.
  const query = `select=${COLUMNS}&lookup_status=eq.found&order=popularity.desc.nullslast&limit=5000`;
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/black_cinema_titles?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Black Cinema: HTTP ${res.status}`);
  return (await res.json()) as BlackCinemaTitle[];
}

let loading: Promise<BlackCinemaTitle[]> | null = null;
const listeners = new Set<(titles: BlackCinemaTitle[]) => void>();

function refresh(): Promise<BlackCinemaTitle[]> {
  if (loading) return loading;
  loading = fetchTitles()
    .then((titles) => {
      if (titles.length > 0) writeStored(titles);
      for (const l of listeners) l(titles);
      return titles;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/**
 * The hub's titles: the device's copy at once (null until there is one), and a fresh copy from
 * the database when the device's is missing or older than a few hours.
 */
export function useBlackCinemaTitles(): { titles: BlackCinemaTitle[] | null; error: boolean } {
  const [titles, setTitles] = useState<BlackCinemaTitle[] | null>(
    () => readStored()?.titles ?? null,
  );
  const [error, setError] = useState(false);
  useEffect(() => {
    const listen = (fresh: BlackCinemaTitle[]) => {
      if (fresh.length > 0) setTitles(fresh);
    };
    listeners.add(listen);
    const stored = readStored();
    if (!stored || Date.now() - stored.at > FRESH_MS) {
      refresh().catch(() => setError(!stored));
    }
    return () => {
      listeners.delete(listen);
    };
  }, []);
  return { titles, error };
}

/**
 * Whether it is Black History Month (February), when Black Cinema takes over Home. Checked again
 * when the app comes back to the screen and every hour, so it starts and ends without a restart.
 */
export function useBlackHistoryMonth(): boolean {
  const [on, setOn] = useState(() => isBlackHistoryMonth(new Date()));
  useEffect(() => {
    const check = () => setOn(isBlackHistoryMonth(new Date()));
    const timer = window.setInterval(check, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return on;
}

/**
 * The hub titles the viewer's IPTV provider carries (onYourIptv), once its libraries have loaded:
 * an empty list until then, and when no provider is set up.
 */
export function useOnYourIptv(titles: BlackCinemaTitle[] | null): BlackCinemaTitle[] {
  const [found, setFound] = useState<BlackCinemaTitle[]>([]);
  useEffect(() => {
    if (!titles?.length) return;
    const controller = new AbortController();
    // After the page is up: a provider's catalog can be large, and the hub shouldn't wait on it.
    const timer = window.setTimeout(() => {
      void import("./streams/provider-vod")
        .then((m) => m.providerVodLibraries(controller.signal))
        .then((libraries) => {
          if (!controller.signal.aborted) setFound(onYourIptv(titles, libraries));
        })
        .catch(() => {});
    }, 3000);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [titles]);
  return found;
}

/** A hub title as the app's title: opens, plays and adds to the library like any other. */
export function blackCinemaMeta(t: BlackCinemaTitle): Meta {
  const base =
    t.media_type === "movie"
      ? movieMeta({
          id: t.tmdb_id ?? 0,
          title: t.title,
          overview: t.overview ?? undefined,
          poster_path: t.poster_path,
          backdrop_path: t.backdrop_path,
          release_date: t.release_date ?? undefined,
          vote_average: t.vote_average ?? undefined,
        })
      : seriesMeta({
          id: t.tmdb_id ?? 0,
          name: t.title,
          overview: t.overview ?? undefined,
          poster_path: t.poster_path,
          backdrop_path: t.backdrop_path,
          first_air_date: t.release_date ?? undefined,
          vote_average: t.vote_average ?? undefined,
        });
  return { ...base, genres: t.genres.length > 0 ? t.genres : base.genres };
}
