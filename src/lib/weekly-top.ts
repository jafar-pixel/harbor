import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { topMovies, topSeries } from "@/lib/cinemeta";
import { get } from "@/lib/providers/tmdb/tmdb-client";
import {
  movieMeta,
  seriesMeta,
  type Page,
  type RawMovie,
  type RawSeries,
} from "@/lib/providers/tmdb/tmdb-meta-mappers";

export type WeeklyKind = "movie" | "series";

const WEEK_MS = 7 * 24 * 3600000;
const lists = new Map<string, Promise<Meta[]>>();

/** Monday-anchored week number, so the list turns over once a week. */
function weekOf(nowMs: number): number {
  // 1970-01-01 was a Thursday; shift so weeks start on Monday.
  return Math.floor((nowMs + 3 * 24 * 3600000) / WEEK_MS);
}

async function load(kind: WeeklyKind, tmdbKey: string): Promise<Meta[]> {
  // TMDB's trending list for the week, else Cinemeta's most popular.
  if (tmdbKey) {
    try {
      if (kind === "movie") {
        const page = await get<Page<RawMovie>>(tmdbKey, "trending/movie/week");
        const out = (page?.results ?? []).map((m) => movieMeta(m));
        if (out.length) return out.slice(0, 10);
      } else {
        const page = await get<Page<RawSeries>>(tmdbKey, "trending/tv/week");
        const out = (page?.results ?? []).map((s) => seriesMeta(s));
        if (out.length) return out.slice(0, 10);
      }
    } catch {
      /* fall back to Cinemeta */
    }
  }
  const metas = await (kind === "movie" ? topMovies() : topSeries()).catch(() => [] as Meta[]);
  return metas.slice(0, 10);
}

/** This week's Top 10 movies or shows. */
export function weeklyTop(kind: WeeklyKind, tmdbKey: string, nowMs = Date.now()): Promise<Meta[]> {
  const key = `${kind}:${weekOf(nowMs)}:${tmdbKey ? "tmdb" : "cinemeta"}`;
  let p = lists.get(key);
  if (!p) {
    p = load(kind, tmdbKey);
    lists.set(key, p);
    // A failed or empty load is tried again next time.
    void p.then((r) => {
      if (!r.length) lists.delete(key);
    });
  }
  return p;
}

export function useWeeklyTop(kind: WeeklyKind, tmdbKey: string): Meta[] {
  const [list, setList] = useState<Meta[]>([]);
  useEffect(() => {
    let live = true;
    void weeklyTop(kind, tmdbKey).then((r) => {
      if (live) setList(r);
    });
    return () => {
      live = false;
    };
  }, [kind, tmdbKey]);
  return list;
}
