import { useEffect, useMemo, useRef } from "react";
import { blackCinemaMeta, useBlackCinemaTitles, useOnYourIptv } from "@/lib/black-cinema";
import {
  BLACK_CINEMA_TABS,
  blackCinemaSections,
  inTab,
  type BlackCinemaTab,
} from "@/lib/black-cinema-core";
import type { Meta } from "@/lib/cinemeta";
import { useBpPagePhase } from "./bp-catalog-page";
import { seedBpMeta, unpinBpMeta } from "./bp-focus-meta";
import { useBpT } from "./bp-i18n";
import { BpChip, BpChipRow } from "./bp-library-chips";
import { BpPageSkeleton } from "./bp-page-skeleton";
import { BP_PAGE_TOP, BpRail, type BpRailEntry } from "./bp-rail";
import { BpRow } from "./bp-row";
import { BpSpotlight } from "./bp-spotlight";
import { useBpPersistedState } from "./bp-view-state";
import { useBpRail } from "./use-bp-rail";
import { bpRailSignature, useBpLayoutReflow } from "./use-bp-row-layout";

/**
 * Black Cinema in Pro: the same cinematic page as Pro Movies and Shows. The focused title fills
 * the spotlight (artwork, logo, scores, trailer preview) and the hub's sections are the rows.
 */
export function BpBlackCinema({ onSelect }: { onSelect: (meta: Meta) => void }) {
  const t = useBpT();
  const { titles, error } = useBlackCinemaTitles();
  const iptv = useOnYourIptv(titles);
  const [tab, setTab] = useBpPersistedState<BlackCinemaTab>("blackCinemaTab", "all");

  const rows = useMemo(() => {
    if (!titles) return [];
    const s = blackCinemaSections(titles, tab, new Date());
    return [
      { id: "top", title: "Top 10", items: s.topTen },
      { id: "iptv", title: "On Your IPTV", items: iptv.filter((x) => inTab(x, tab)).slice(0, 40) },
      { id: "trending", title: "Trending", items: s.trending },
      { id: "new-movies", title: "New Movies", items: s.newMovies },
      { id: "new-shows", title: "New Shows", items: s.newShows },
      { id: "classics", title: "Classics", items: s.classics },
      ...s.rows,
    ]
      .filter(({ items }) => items.length > 0)
      .map((row) => ({ ...row, metas: row.items.map(blackCinemaMeta) }));
  }, [titles, tab, iptv]);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const phase = useBpPagePhase(pageRef);
  const signature = bpRailSignature(["tabs", ...rows.map((r) => r.id)]);
  const { railRef, activeRow, railShift } = useBpRail(signature);
  useBpLayoutReflow({ railRef, signature, routeKey: "black-cinema" });
  const seed = rows[0]?.metas[0];

  useEffect(() => {
    unpinBpMeta();
    seedBpMeta(seed ?? null);
  }, [seed?.id]);

  if (!titles && !error) return <BpPageSkeleton topClass={BP_PAGE_TOP} />;

  const entries: BpRailEntry[] = [
    {
      key: "tabs",
      node: (
        <BpChipRow>
          {BLACK_CINEMA_TABS.map(({ id, label }) => (
            <BpChip
              key={id}
              label={t(label)}
              selected={tab === id}
              restoreKey={`black-cinema-tab-${id}`}
              onSelect={() => setTab(id)}
            />
          ))}
        </BpChipRow>
      ),
    },
    ...rows.map((row, i) => ({
      key: row.id,
      node: (
        <BpRow
          title={t(row.title)}
          metas={row.metas}
          onSelect={onSelect}
          autofocusFirst={i === 0}
        />
      ),
    })),
  ];

  return (
    <div ref={pageRef} className="relative flex h-full flex-col">
      <div data-bp-page-hero className={`relative z-20 shrink-0 ${BP_PAGE_TOP}`}>
        <BpSpotlight phase={phase} onOpenDetails={onSelect} />
      </div>
      {rows.length === 0 ? (
        <p
          role="status"
          className="px-[var(--bp-gutter)] text-[clamp(14px,2vh,22px)] text-ink-muted"
        >
          {t(error ? "Black Cinema couldn't load. Check your connection." : "No titles found")}
        </p>
      ) : (
        <BpRail railRef={railRef} entries={entries} activeRow={activeRow} railShift={railShift} />
      )}
    </div>
  );
}
