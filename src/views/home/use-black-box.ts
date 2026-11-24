import { useEffect, useMemo, useState } from "react";
import type { Slide } from "@/components/hero-carousel";
import { blackBoxCatalogsFor } from "@/lib/black-box-core";
import { blackBoxPage } from "@/lib/black-box";
import type { BrowseCatalog } from "@/lib/catalog-browse";
import type { Meta } from "@/lib/cinemeta";
import { useSettings } from "@/lib/settings";

const SLIDES = 6;

/**
 * The Black Box on Home, its main feature: slides for the Featured hero (films and series taken in
 * turn, only those with artwork) and its catalogs for the rows under it. Nothing without a TMDB key,
 * and Home keeps its usual hero.
 */
export function useBlackBox(): { catalogs: BrowseCatalog[]; slides: Slide[] } {
  const { settings } = useSettings();
  const key = settings.tmdbKey?.trim() ?? "";
  const catalogs = useMemo(() => blackBoxCatalogsFor(!!key), [key]);
  const [slides, setSlides] = useState<Slide[]>([]);
  useEffect(() => {
    if (!key) {
      setSlides([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      blackBoxPage("movies", 1).catch(() => [] as Meta[]),
      blackBoxPage("series", 1).catch(() => [] as Meta[]),
    ]).then(([movies, series]) => {
      if (cancelled) return;
      const out: Slide[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < Math.max(movies.length, series.length) && out.length < SLIDES; i++) {
        for (const m of [movies[i], series[i]]) {
          if (!m?.background || seen.has(m.id) || out.length >= SLIDES) continue;
          seen.add(m.id);
          out.push({ meta: m });
        }
      }
      setSlides(out);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return { catalogs, slides };
}
