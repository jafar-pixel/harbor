import { useMemo, useState } from "react";
import { blackCinemaMeta, useBlackCinemaTitles } from "@/lib/black-cinema";
import {
  BLACK_CINEMA_TABS,
  blackCinemaSections,
  type BlackCinemaTab,
} from "@/lib/black-cinema-core";
import type { Meta } from "@/lib/cinemeta";
import { BpGridScroller } from "./bp-grid";
import { useBpT } from "./bp-i18n";
import { BP_PAGE_TOP } from "./bp-rail";
import { BpRow } from "./bp-row";

export function BpBlackCinema({ onSelect }: { onSelect: (meta: Meta) => void }) {
  const { titles, error } = useBlackCinemaTitles();
  const [tab, setTab] = useState<BlackCinemaTab>("all");
  const t = useBpT();
  const rows = useMemo(() => {
    if (!titles) return [];
    const sections = blackCinemaSections(titles, tab, new Date());
    return [
      { id: "top", title: "Top 10", items: sections.topTen },
      { id: "trending", title: "Trending", items: sections.trending },
      { id: "movies", title: "New Movies", items: sections.newMovies },
      { id: "shows", title: "New Shows", items: sections.newShows },
      { id: "classics", title: "Classics", items: sections.classics },
      ...sections.rows,
    ].filter(({ items }) => items.length > 0);
  }, [titles, tab]);

  return (
    <section className={`flex h-full flex-col px-[var(--bp-gutter)] ${BP_PAGE_TOP}`}>
      <h1 className="mb-4 text-3xl font-semibold">{t("Black Cinema")}</h1>
      <div className="mb-4 flex flex-wrap gap-3" data-bp-rail-row aria-label={t("Black Cinema")}>
        {BLACK_CINEMA_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            data-bp-focusable
            aria-pressed={tab === id}
            className="rounded-full border border-edge-soft px-4 py-2 aria-pressed:bg-ink aria-pressed:text-canvas"
            onClick={() => setTab(id)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <BpGridScroller>
        {rows.map(({ id, title, items }) => (
          <BpRow key={id} title={t(title)} metas={items.map(blackCinemaMeta)} onSelect={onSelect} />
        ))}
        {rows.length === 0 && (
          <p role="status">
            {t(
              error
                ? "Black Cinema couldn't load. Check your connection."
                : titles
                  ? "No titles found"
                  : "Loading Black Cinema…",
            )}
          </p>
        )}
      </BpGridScroller>
    </section>
  );
}
