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
import { DEFAULT_SPORTS_LEAGUES, LEAGUES } from "@/lib/sports/espn";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { useChannelHydration } from "./hooks/use-channel-hydration";
import { CountryBar } from "./live-home/country-bar";
import { SportsMarquee } from "./live-home/sports/sports-marquee";
import { useSports } from "./live-home/use-sports";
import { GuideCard } from "./live-home/guide-card";
import { JlSportsHub } from "./live-home/jl-sports/jl-sports-hub";
import { JlSportsHero } from "./live-home/jl-sports/sports-hero";
import { useJlSports } from "./live-home/jl-sports/use-jl-sports";
import { useJlSportsDialogs } from "./live-home/jl-sports/use-jl-sports-dialogs";
import { LiveHero } from "./live-home/live-hero";
import { ChannelLogoRow } from "./live-home/channel-logo-row";
import { NowCard } from "./live-home/now-card";
import { fmtClock } from "./live-home/now-format";
import {
  buildNowItem,
  hydrationKey,
  useLiveHome,
  type ChannelRail,
} from "./live-home/use-live-home";
import { ContinueAnywhereRow } from "@/views/continue/continue-anywhere";

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
  const { settings, update } = useSettings();
  const userSportsLeagues = settings.sportsLeagues?.length
    ? settings.sportsLeagues
    : DEFAULT_SPORTS_LEAGUES;

  const saveSportsLeagues = (keys: string[]) => {
    update({ sportsLeagues: keys });
  };

  const [sportsLeague, setSportsLeague] = useState<string>(() => {
    try {
      return localStorage.getItem("harbor.sports.league") || "all";
    } catch {
      return "all";
    }
  });
  const pickLeague = (k: string) => {
    setSportsLeague(k);
    try {
      localStorage.setItem("harbor.sports.league", k);
    } catch {}
  };
  const sportsLeagues = useMemo(
    () => (sportsLeague === "all" ? userSportsLeagues : [sportsLeague]),
    [sportsLeague, userSportsLeagues],
  );
  const sports = useSports({ enabled: true, leagues: sportsLeagues });
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
    if (tuned?.channel.id === ch.id) onPlay(ch);
    else setTunedId(ch.id);
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

  // The logo strip under Your TV: the viewer's favorites, else what they watched last, else
  // the channels Your TV cycles through.
  const logoStrip = useMemo(() => {
    const fav = rails.find((r) => r.key === "fav")?.channels;
    if (fav?.length) return { title: t("Your favorites"), channels: fav };
    const recent = rails.find((r) => r.key === "recent")?.channels;
    if (recent?.length) return { title: t("Recently watched"), channels: recent };
    return { title: t("Channels"), channels: spotlight.map((it) => it.channel) };
  }, [rails, spotlight, t]);

  const railProps = { sourceId, epg, nowMs, tvgCounts, onPlay: tune, onOpenCategory };

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2.5 ps-[9px]">
          <h1 className="font-display text-[30px] font-medium leading-none tracking-tight text-ink">
            {t("Your TV")}
          </h1>
          <span className="text-[16px] text-ink-subtle">
            {t("at {time}", { time: fmtClock(nowMs) })}
          </span>
          <span className="ms-auto hidden text-[13px] text-ink-subtle md:inline">
            {t("Click a channel to put it on. Double-click to watch full screen.")}
          </span>
        </div>
        {heroItems.length > 0 && (
          <LiveHero
            items={heroItems}
            nowMs={nowMs}
            hydrations={heroHydrations}
            active={active}
            onPlay={onPlay}
          />
        )}
      </div>
      <ChannelLogoRow
        title={logoStrip.title}
        channels={logoStrip.channels.slice(0, 24)}
        tunedId={tuned?.channel.id ?? null}
        onTune={tune}
      />
      {guide.length > 0 && (
        <Row
          title={t("On now")}
          shape="landscape"
          min={300}
          scrollKey={`live-home:${sourceId}:guide`}
        >
          {guide.map((it) => (
            <GuideCard key={it.channel.id} item={it} onPlay={tune} />
          ))}
        </Row>
      )}
      <ContinueAnywhereRow scrollKey="live-home:continue" />
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
      <JlSportsHub
        top={jlSports.top}
        ticker={jlSports.ticker}
        favorites={jlSports.teams}
        actions={jlDialogs.actions}
        onOpenGame={openMatchDetail}
      />
      {(sports.length > 0 || sportsLeague !== "all" || userSportsLeagues.length > 0) && (
        <SportsMarquee
          games={sports}
          leagues={LEAGUES}
          selected={sportsLeague}
          selectedLeagues={userSportsLeagues}
          onLeague={pickLeague}
          onLeaguesChange={saveSportsLeagues}
          onSelect={openMatchDetail}
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
