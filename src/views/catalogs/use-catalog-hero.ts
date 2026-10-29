import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useHideAnimeMetas } from "@/lib/anime-hide";
import { browseFetcher, type BrowseCatalog } from "@/lib/catalog-browse";

const SOURCE_CATALOGS = 3;
const SLIDES = 6;

/**
 * Slides for the Catalogs hero: titles with artwork from the first few film and series catalogs
 * on the page (pinned ones first), taken in turn so one addon doesn't fill the hero.
 */
export function useCatalogHero(catalogs: BrowseCatalog[]): Meta[] {
  const sources = catalogs
    .filter((c) => c.type === "movie" || c.type === "series")
    .slice(0, SOURCE_CATALOGS);
  const key = sources.map((c) => c.key).join("|");
  const [slides, setSlides] = useState<Meta[]>([]);
  useEffect(() => {
    if (sources.length === 0) {
      setSlides([]);
      return;
    }
    let cancelled = false;
    void Promise.all(sources.map((c) => browseFetcher(c, null)(1).catch(() => [] as Meta[]))).then(
      (lists) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const out: Meta[] = [];
        const depth = Math.max(0, ...lists.map((l) => l.length));
        for (let i = 0; i < depth && out.length < SLIDES; i++) {
          for (const list of lists) {
            const m = list[i];
            if (!m?.background || seen.has(m.id) || out.length >= SLIDES) continue;
            seen.add(m.id);
            out.push(m);
          }
        }
        setSlides(out);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useHideAnimeMetas(slides);
}
