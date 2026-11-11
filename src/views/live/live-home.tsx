import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Row } from "@/components/row";
import { useT } from "@/lib/i18n";
import { computeTvgIdCounts } from "@/lib/iptv/epg-resolver";
import type { EpgIndex, IptvChannel } from "@/lib/iptv/types";
import { isHydratableChannel } from "@/lib/iptv/channel-hydration";
import { flagUrl } from "@/lib/iptv/country-detect";
import { clearCountries, toggleCountry, useCountryPrefs } from "@/lib/iptv/country-prefs";
import { useFavorites } from "@/lib/iptv/favorites";
import { useView } from "@/lib/view";
import { useSettings } from "@/lib/settings";
import { topChannels, useChannelStatsVersion } from "@/lib/iptv/channel-stats";
import { useChannelHydration } from "./hooks/use-channel-hydration";
import { CountryBar } from "./live-home/country-bar";
import { JlSportsHero } from "./live-home/jl-sports/sports-hero";
import { useJlSports } from "./live-home/jl-sports/use-jl-sports";
import { useJlSportsDialogs } from "./live-home/jl-sports/use-jl-sports-dialogs";
import { LiveHero } from "./live-home/live-hero";
import { NowNextBar, SurfList } from "./live-home/surf-list";
import { NowCard } from "./live-home/now-card";
import { AmbientBackdrop } from "./live-home/ambient";
import { ChannelArt, ChannelGamesContext, channelGameMap } from "./live-home/channel-art";
import { ChannelsTopRow, SportsTopRow, WeeklyTopRow } from "./live-home/top-ten";
import { fmtClock } from "./live-home/now-format";
import {
  buildNowItem,
  hydrationKey,
  useLiveHome,
  type ChannelRail,
} from "./live-home/use-live-home";
import { ContinueAnywhereRow } from "@/views/continue/continue-anywhere";
import { nativeTvAvailable } from "@/lib/player/native-tv/shell";
import { requestSmallTvFull } from "@/lib/player/native-tv/small-screen";

export function LiveHome({
  channels,
  epg,
  nowMs,
  sourceId,
  region,
  favorites,
  active,
  onPlay,
  onOpenCategory,
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
  onOpenCategory: (group: string) => void;
}) {
  const t = useT();
  const { openMatchDetail } = useView();
  const { spotlight, guide, rails, categoryRails, countries } = useLiveHome({
    channels,
    epg,
    nowMs,
    sourceId,
    region,
    favorites,
  });
  const countryPrefs = useCountryPrefs(sourceId);
  const tvgCounts = useMemo(() => computeTvgIdCounts(channels), [channels]);
  const jlSports = useJlSports({ channels, epg, nowMs });
  const jlDialogs = useJlSportsDialogs({
    players: jlSports.players,
    onPlay,
    onOpenGame: openMatchDetail,
  });

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
  const heroItems = useMemo(() => (tuned ? [tuned] : spotlight), [tuned, spotlight]);

  const heroHydrations = useChannelHydration(
    useMemo(() => {
      const set = new Set<string>();
      for (const it of [...heroItems, ...spotlight])
        if (isHydratableChannel(it.channel)) set.add(hydrationKey(it));
      return [...set];
    }, [heroItems, spotlight]),
  );

  // The surfer beside Your TV: favorites, then what was watched last, then what's on now.
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

  // Fan art: which game each channel carries, for every card, the surfer and Your TV.
  const channelGames = useMemo(() => channelGameMap(jlSports.top), [jlSports.top]);
  const surfHydrations = useChannelHydration(
    useMemo(() => {
      const set = new Set<string>();
      for (const tab of surfTabs)
        for (const it of tab.items.slice(0, 40))
          if (isHydratableChannel(it.channel)) set.add(hydrationKey(it));
      return [...set];
    }, [surfTabs]),
  );

  // The viewer's most-watched channels (this device), for "Your Top 10 channels".
  const statsVersion = useChannelStatsVersion();
  const topChannelItems = useMemo(() => {
    void statsVersion;
    const byId = new Map(channels.map((c) => [c.id, c]));
    return topChannels(10, sourceId)
      .map((s) => byId.get(s.id))
      .filter((c): c is IptvChannel => !!c)
      .map((c) => buildNowItem(c, epg, tvgCounts, nowMs));
  }, [statsVersion, channels, sourceId, epg, tvgCounts, nowMs]);
  const { settings } = useSettings();

  // The backdrop rests on the channel on Your TV until the remote moves to something else.
  const ambientItem = tuned ?? heroItems[0] ?? null;
  const ambientFallback = useMemo(
    () =>
      ambientItem
        ? {
            key: `ch:${ambientItem.channel.id}`,
            art: (
              <ChannelArt
                item={ambientItem}
                hydrated={heroHydrations.get(hydrationKey(ambientItem)) ?? null}
              />
            ),
          }
        : null,
    [ambientItem, heroHydrations],
  );

  const railProps = { sourceId, epg, nowMs, tvgCounts, onPlay: tune, onOpenCategory };

  return (
    <ChannelGamesContext.Provider value={channelGames}>
      <AmbientBackdrop fallback={ambientFallback}>
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
                {t("Rest on a channel to put it on. Select it again to watch full screen.")}
              </span>
            </div>
            {/* The TV deck: Your TV with what's on now and next, and the channel surfer beside it. */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(320px,1fr)]">
              <div className="flex min-w-0 flex-col gap-3">
                {heroItems.length > 0 && (
                  <LiveHero
                    items={heroItems}
                    nowMs={nowMs}
                    hydrations={heroHydrations}
                    active={active}
                    onPlay={onPlay}
                  />
                )}
                <NowNextBar item={tuned ?? heroItems[0] ?? null} nowMs={nowMs} />
              </div>
              <div className="relative min-h-[360px]">
                <div className="lg:absolute lg:inset-0">
                  <SurfList
                    tabs={surfTabs}
                    tunedId={tuned?.channel.id ?? null}
                    nowMs={nowMs}
                    hydrations={surfHydrations}
                    onTune={tune}
                  />
                </div>
              </div>
            </div>
          </div>
          <ContinueAnywhereRow scrollKey="live-home:continue" />
          <SportsTopRow games={jlSports.top} onWatch={tune} onOpenGame={openMatchDetail} />
          <ChannelsTopRow items={topChannelItems} onPlay={tune} />
          <WeeklyTopRow kind="movie" tmdbKey={settings.tmdbKey} />
          <WeeklyTopRow kind="series" tmdbKey={settings.tmdbKey} />
          {(jlSports.top.length > 0 ||
            jlSports.teamSlides.length > 0 ||
            jlSports.playerSlides.length > 0) && (
            <JlSportsHero
              top={jlSports.top}
              teamSlides={jlSports.teamSlides}
              playerSlides={jlSports.playerSlides}
              actions={jlDialogs.actions}
              onOpenGame={openMatchDetail}
            />
          )}
          {rails.map((rail) => (
            <RailRow key={rail.key} rail={rail} {...railProps} />
          ))}
          <CountryBar
            countries={countries}
            selected={countryPrefs.selected}
            onToggle={(code) => toggleCountry(sourceId, code)}
            onClear={() => clearCountries(sourceId)}
          />
          {categoryRails.map((rail) => (
            <LazyRail key={rail.key}>
              <RailRow rail={rail} {...railProps} />
            </LazyRail>
          ))}
          {jlDialogs.dialogs}
        </div>
      </AmbientBackdrop>
    </ChannelGamesContext.Provider>
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
  onOpenCategory,
}: {
  rail: ChannelRail;
  sourceId: string;
  epg: EpgIndex | null;
  nowMs: number;
  tvgCounts: Map<string, number>;
  onPlay: (ch: IptvChannel) => void;
  onOpenCategory: (group: string) => void;
}) {
  const items = useMemo(
    () => rail.channels.map((ch) => buildNowItem(ch, epg, tvgCounts, nowMs)),
    [rail.channels, epg, tvgCounts, nowMs],
  );
  const hydrations = useChannelHydration(
    useMemo(() => {
      const set = new Set<string>();
      for (const it of items.slice(0, 14))
        if (isHydratableChannel(it.channel)) set.add(hydrationKey(it));
      return [...set];
    }, [items]),
  );
  const title = rail.group ? (
    <button
      onClick={() => onOpenCategory(rail.group!)}
      className="group/see inline-flex items-center gap-2 text-ink transition-colors hover:text-ink-muted"
    >
      {rail.flagCode && <RailFlag code={rail.flagCode} />}
      <span dir="auto">{rail.title}</span>
      <ChevronRight
        size={18}
        strokeWidth={2.4}
        className="dir-icon text-ink-subtle transition-transform duration-200 group-hover/see:translate-x-0.5 rtl:group-hover/see:-translate-x-0.5"
      />
    </button>
  ) : (
    rail.title
  );
  return (
    <Row title={title} shape="landscape" min={300} scrollKey={`live-home:${sourceId}:${rail.key}`}>
      {items.map((it) => (
        <NowCard
          key={it.channel.id}
          item={it}
          hydrated={hydrations.get(hydrationKey(it)) ?? null}
          onPlay={onPlay}
        />
      ))}
    </Row>
  );
}

function RailFlag({ code }: { code: string }) {
  const [err, setErr] = useState(false);
  const url = flagUrl(code);
  if (!url || err) return null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      onError={() => setErr(true)}
      className="h-4 w-[26px] rounded-[3px] object-cover ring-1 ring-black/25"
    />
  );
}
