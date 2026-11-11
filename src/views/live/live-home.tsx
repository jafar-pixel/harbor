import { useEffect, useMemo, useRef, useState } from "react";
import { Row } from "@/components/row";
import { useT } from "@/lib/i18n";
import { computeTvgIdCounts } from "@/lib/iptv/epg-resolver";
import type { EpgIndex, IptvChannel } from "@/lib/iptv/types";
import type { Meta } from "@/lib/cinemeta";
import { useFavorites } from "@/lib/iptv/favorites";
import { useView } from "@/lib/view";
import { liveGenreRows } from "@/lib/agents/live/rows";
import { useLiveAgentVersion } from "@/lib/agents/live/store";
import { LiveHero } from "./live-home/live-hero";
import { NowNextBar, SurfList } from "./live-home/surf-list";
import { NowCard } from "./live-home/now-card";
import { fmtClock } from "./live-home/now-format";
import { buildNowItem, useLiveHome, type ChannelRail } from "./live-home/use-live-home";
import { nativeTvAvailable } from "@/lib/player/native-tv/shell";
import { requestSmallTvFull } from "@/lib/player/native-tv/small-screen";

const GENRE_TITLE: Record<string, string> = {
  news: "News on now",
  kids: "Kids on now",
  movies: "Movie channels on now",
  entertainment: "Entertainment on now",
  documentary: "Documentaries on now",
  lifestyle: "Home, food & travel on now",
  music: "Music on now",
  spanish: "En español ahora",
  faith: "Faith on now",
};

/** Program pictures aren't looked up on Live TV: channels show their own logos. */
const NO_HYDRATIONS = new Map<string, Meta | null>();

/**
 * Live TV: one page. Your TV with what's on now and next, the channel box beside it (search,
 * Favorites, Recent, On now), and rows of what's on by kind of channel below. Channels show their
 * own logos; nothing else is looked up. The provider and refresh are in Settings › Live TV.
 */
export function LiveHome({
  channels,
  epg,
  nowMs,
  sourceId,
  region,
  favorites,
  active,
  onPlay,
}: {
  channels: IptvChannel[];
  epg: EpgIndex | null;
  nowMs: number;
  sourceId: string;
  region: string;
  favorites: ReturnType<typeof useFavorites>;
  /** Live TV is on screen; the Your TV preview stops while it isn't. */
  active: boolean;
  onPlay: (ch: IptvChannel) => void;
}) {
  const t = useT();
  const { player } = useView();
  // The rows below Your TV only live while Live TV is on screen and no player covers it, so the
  // rest of the app (and a 4K movie's player) gets the memory back.
  const explore = active && !player;
  const { spotlight, guide, rails } = useLiveHome({
    channels,
    epg,
    nowMs,
    sourceId,
    region,
    favorites,
  });
  const tvgCounts = useMemo(() => computeTvgIdCounts(channels), [channels]);

  // A click puts a channel on the Your TV screen; clicking the channel already on it (so a
  // double click, or a second OK on a remote) opens it in the full player.
  const [tunedId, setTunedId] = useState<string | null>(null);
  const tuned = useMemo(() => {
    const ch = tunedId ? channels.find((c) => c.id === tunedId) : undefined;
    return ch ? buildNowItem(ch, epg, tvgCounts, nowMs) : null;
  }, [tunedId, channels, epg, tvgCounts, nowMs]);
  const tune = (ch: IptvChannel) => {
    // On the Shield the channel already playing on Your TV goes full screen as the same stream.
    if (tuned?.channel.id === ch.id) {
      if (!(nativeTvAvailable() && requestSmallTvFull())) onPlay(ch);
    } else setTunedId(ch.id);
  };
  const preview = (ch: IptvChannel) => setTunedId(ch.id);
  const heroItems = useMemo(() => (tuned ? [tuned] : spotlight), [tuned, spotlight]);

  // Your TV is pinned: as soon as the page scrolls, it becomes a small screen in the top corner
  // (the same player, so the stream carries on) while the viewer explores the rows. It switches
  // at once instead of sliding up first, and switches back when the page is at the top again.
  const heroSlot = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const hasHero = heroItems.length > 0;
  useEffect(() => {
    const el = heroSlot.current;
    if (!el || !active) {
      setPinned(false);
      return;
    }
    let root: HTMLElement | null = el.parentElement;
    while (root && !/(auto|scroll)/.test(getComputedStyle(root).overflowY))
      root = root.parentElement;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        const top = e.rootBounds?.top ?? 0;
        setPinned(e.intersectionRatio < 0.98 && e.boundingClientRect.top < top);
      },
      { root, threshold: [0, 0.5, 0.98, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [active, hasHero]);
  // While pinned, rows the remote moves to stop below the small screen instead of under it.
  useEffect(() => {
    if (!pinned) return;
    let scroller: HTMLElement | null = heroSlot.current?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
      scroller = scroller.parentElement;
    const target = scroller ?? document.documentElement;
    const before = target.style.scrollPaddingTop;
    target.style.scrollPaddingTop = "min(19vw, 300px)";
    return () => {
      target.style.scrollPaddingTop = before;
    };
  }, [pinned]);

  // The channel box beside Your TV: favorites, then what was watched last, then what's on now.
  const surfTabs = useMemo(() => {
    const items = (key: string) =>
      (rails.find((r) => r.key === key)?.channels ?? [])
        .slice(0, 40)
        .map((ch) => buildNowItem(ch, epg, tvgCounts, nowMs));
    return [
      { key: "fav", label: t("Favorites"), items: items("fav") },
      { key: "recent", label: t("Recent"), items: items("recent") },
      { key: "now", label: t("On now"), items: guide.length ? guide : spotlight },
    ];
  }, [rails, guide, spotlight, epg, tvgCounts, nowMs, t]);

  // The Live TV agent's rows: what's on now, by kind of channel.
  const liveAgentVersion = useLiveAgentVersion();
  const genreRails = useMemo((): ChannelRail[] => {
    void liveAgentVersion;
    if (!explore) return [];
    return liveGenreRows(channels).map((r) => ({
      key: `genre:${r.genre}`,
      title: t(GENRE_TITLE[r.genre] ?? r.genre),
      group: null,
      channels: r.channels,
    }));
  }, [explore, channels, liveAgentVersion, t]);

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2.5 ps-[9px]">
          <h1 className="font-display text-[30px] font-medium leading-none tracking-tight text-ink">
            {t("Your TV")}
          </h1>
          <span className="text-[16px] text-ink-subtle">
            {t("at {time}", { time: fmtClock(nowMs) })}
          </span>
          <span className="ms-auto hidden text-[13px] text-ink-subtle md:inline">
            {t("Rest on a channel to put it on Your TV. Select it again to watch full screen.")}
          </span>
        </div>
        {/* Your TV with what's on now and next, and the channel box beside it. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(320px,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            {hasHero && (
              // Holds Your TV's place while it is pinned, so the page doesn't jump.
              <div
                ref={heroSlot}
                className={`relative aspect-video w-full ${nativeTvAvailable() ? "" : "max-h-[72vh]"}`}
              >
                <LiveHero
                  items={heroItems}
                  nowMs={nowMs}
                  hydrations={NO_HYDRATIONS}
                  active={active}
                  mini={pinned}
                  onPlay={onPlay}
                />
              </div>
            )}
            <NowNextBar item={tuned ?? heroItems[0] ?? null} nowMs={nowMs} />
          </div>
          <div className="relative min-h-[360px]">
            <div className="lg:absolute lg:inset-0">
              <SurfList
                tabs={surfTabs}
                channels={channels}
                epg={epg}
                tvgCounts={tvgCounts}
                tunedId={tuned?.channel.id ?? null}
                nowMs={nowMs}
                onTune={tune}
              />
            </div>
          </div>
        </div>
      </div>
      {genreRails.map((rail) => (
        <LazyRail key={rail.key}>
          <RailRow
            rail={rail}
            sourceId={sourceId}
            epg={epg}
            nowMs={nowMs}
            tvgCounts={tvgCounts}
            onPlay={tune}
            onRest={preview}
          />
        </LazyRail>
      ))}
    </div>
  );
}

function LazyRail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) setShow(true);
      },
      { rootMargin: "700px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return (
    <div ref={ref} style={show ? undefined : { minHeight: 250 }}>
      {show ? children : null}
    </div>
  );
}

function RailRow({
  rail,
  sourceId,
  epg,
  nowMs,
  tvgCounts,
  onPlay,
  onRest,
}: {
  rail: ChannelRail;
  sourceId: string;
  epg: EpgIndex | null;
  nowMs: number;
  tvgCounts: Map<string, number>;
  onPlay: (ch: IptvChannel) => void;
  onRest: (ch: IptvChannel) => void;
}) {
  const items = useMemo(
    () => rail.channels.map((ch) => buildNowItem(ch, epg, tvgCounts, nowMs)),
    [rail.channels, epg, tvgCounts, nowMs],
  );
  return (
    <Row
      title={rail.title}
      shape="landscape"
      min={300}
      scrollKey={`live-home:${sourceId}:${rail.key}`}
    >
      {items.map((it) => (
        <NowCard key={it.channel.id} item={it} onPlay={onPlay} onRest={onRest} />
      ))}
    </Row>
  );
}
