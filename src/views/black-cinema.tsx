import { useEffect, useMemo, useState } from "react";
import { CinemaHero } from "@/components/cinema-hero";
import { FeedShelf } from "@/components/feed-shelf";
import { Row } from "@/components/row";
import { TopRankCard } from "@/components/top-rank-card";
import type { Meta } from "@/lib/cinemeta";
import { blackCinemaMeta, useBlackCinemaTitles } from "@/lib/black-cinema";
import {
  BLACK_CINEMA_TABS,
  blackCinemaSections,
  type BlackCinemaTab,
  type BlackCinemaTitle,
} from "@/lib/black-cinema-core";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";

/**
 * Black Cinema: JL's permanent hub of Black movies and television. New & Featured up top, then Top
 * Ten, Trending, New Movies, New Shows and Classics, then the 30 collection rows; tabs narrow it to
 * Movies, TV Shows, Classics or 2026 Releases. In February it is Home (see home.tsx).
 */
export function BlackCinema({
  active = true,
  takeover = false,
  onReady,
}: {
  active?: boolean;
  /** Shown as Home during Black History Month. */
  takeover?: boolean;
  /** As Home: tells the app its first screen is up. */
  onReady?: () => void;
}) {
  const t = useT();
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  const { openGrid } = useView();
  const { titles, error } = useBlackCinemaTitles();
  const [tab, setTab] = useState<BlackCinemaTab>("all");
  const sections = useMemo(
    () => (titles ? blackCinemaSections(titles, tab, new Date()) : null),
    [titles, tab],
  );
  void active;

  const shelf = (id: string, title: string, items: BlackCinemaTitle[]) => {
    const metas = items.map(blackCinemaMeta);
    return (
      <FeedShelf
        key={id}
        shelf={{ id: `black-cinema-${id}`, title: t(title), kicker: t("Black Cinema") }}
        items={metas}
        scrollKey={`black-cinema:${tab}:${id}`}
        onViewAll={() =>
          openGrid({
            title: t(title),
            fetcher: async (page: number) => (page <= 1 ? metas : ([] as Meta[])),
            initial: metas,
            initialPage: 1,
          })
        }
      />
    );
  };

  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24">
      {sections && sections.featured.length > 0 && (
        <CinemaHero slides={sections.featured.map(blackCinemaMeta)} eyebrow={t("New & Featured")} />
      )}
      <div className={`flex flex-col gap-8 px-12 ${sections?.featured.length ? "pt-10" : "pt-28"}`}>
        <header className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.32em] text-accent">
              {takeover ? t("Black History Month · Black Cinema") : t("Black Cinema")}
            </span>
            <h1 className="font-display text-[30px] font-medium tracking-tight text-ink">
              {t("Our Stories. Our Culture. Our Legacy.")}
            </h1>
          </div>
          <div role="tablist" className="flex flex-wrap gap-2">
            {BLACK_CINEMA_TABS.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={tab === x.id}
                onClick={() => setTab(x.id)}
                className={`h-10 rounded-full px-5 text-[13.5px] font-semibold transition-colors ${
                  tab === x.id
                    ? "bg-ink text-canvas"
                    : "border border-edge-soft bg-elevated/40 text-ink-muted hover:bg-elevated hover:text-ink"
                }`}
              >
                {t(x.label)}
              </button>
            ))}
          </div>
        </header>

        {!sections ? (
          <p className="text-[14px] text-ink-muted">
            {error
              ? t("Black Cinema couldn't load. Check your connection.")
              : t("Loading Black Cinema…")}
          </p>
        ) : (
          <>
            {sections.topTen.length > 0 && (
              <Row
                title={t("Black Cinema Top 10")}
                min={180}
                shape="rank"
                scrollKey={`black-cinema:${tab}:top10`}
              >
                {sections.topTen.map((m, i) => (
                  <TopRankCard key={m.id} meta={blackCinemaMeta(m)} rank={i + 1} />
                ))}
              </Row>
            )}
            {sections.trending.length > 0 && shelf("trending", "Trending", sections.trending)}
            {sections.newMovies.length > 0 && shelf("new-movies", "New Movies", sections.newMovies)}
            {sections.newShows.length > 0 && shelf("new-shows", "New Shows", sections.newShows)}
            {sections.classics.length > 0 && shelf("classics", "Classics", sections.classics)}
            {sections.rows.map((row) => shelf(row.id, row.title, row.items))}
          </>
        )}
      </div>
    </main>
  );
}
