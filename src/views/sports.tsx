import { SportsHomeLayout } from "./sports/home-layout";
import type { SportCategory } from "@/lib/jl/sports/sports-channels";
import { SportsSelect } from "./sports/sports-select";
import { SportsHotEventsSkeleton, SportsRailSkeleton } from "./sports/sports-skeletons";
import { LeagueLogo } from "./sports/league-logo";
import { lazy, Suspense, useMemo, useRef, useState, useEffect } from "react";
import { ArrowUp, ArrowRight, CalendarDays } from "lucide-react";
import { SportsRefreshButton } from "./sports/refresh-button";
import { useT, useUiLanguage } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useScrollMemory, useView } from "@/lib/view";
import type { EsportsMatch } from "@/lib/sports/esports-feeds";
import { officialBroadcastSource } from "@/lib/sports/esports-streams";
import { getGroupLabel, getLeagueLabel, type SportsGame } from "@/lib/sports/espn";
import { involvesTeam, useFavourites } from "@/lib/sports/favourites";
import { dayStamp, HUB_GROUPS, HUB_LEAGUES, hubLeague } from "@/lib/sports/hub-data";
import { syncSportsReminders } from "@/lib/sports/reminders";
import { diverseEvents, featuredEvents } from "@/lib/sports/hub-discovery";
import { currentLiveGames, liveDateRange, liveScoreboardKeys } from "@/lib/sports/live-schedule";
import { eventCards, mergeSlices } from "@/lib/sports/hub-cache";
import { sportsHomeHidden } from "@/lib/sports/home-layout";
import { HubRow } from "./sports/hub-cards";
import { HubCarousel } from "./sports/hub-carousel";
import { HubPitchSpotlight } from "./sports/hub-pitch-spotlight";
import { HubSchedule } from "./sports/hub-schedule";
import { SportsDateBar, buildDays } from "./sports/date-bar";
import { useSportsHub } from "./sports/use-hub";
import "./sports/hub.css";
import "./sports/esports-hub.css";
import { useDragScroll } from "@/lib/use-drag-scroll";
import { SportsExplorer } from "./sports/sports-explorer";
import { SportIcon } from "./sports/sport-icon";
import {
  selectedSportsLeagues,
  sportsSelectionScope,
  gamesInSportsSelection,
} from "@/lib/sports/personalization";
import { SportsAccessGate } from "./sports/access-gate";
import { SportsNoProviderNote } from "./sports/no-provider-note";
import { SportsPersonalizeHint } from "./sports/personalize-hint";
import { followedGamesThisWeek, selectTopGames } from "@/lib/jl/sports/gameday";
import { isFavoriteGame, rankGames } from "@/lib/jl/sports/rank";
import { effectiveTeams, useJlFavoritePlayers } from "@/lib/jl/sports/favorites";
import { useHubTeams } from "./live/live-home/jl-sports/use-jl-sports";
import { useSportPrefs } from "./live/live-home/jl-sports/use-jl-sports";
import { leaguesForToday } from "@/lib/jl/sports/sport-priorities";
import { heroFeatured } from "@/lib/jl/sports/hub-sections";
import type { IptvChannel } from "@/lib/iptv/types";
import { GameStoriesRow } from "./live/live-home/jl-sports/game-stories";
import { AlsoToday, JlSportsHub } from "./live/live-home/jl-sports/jl-sports-hub";
import {
  LiveSportsChannelsView,
  useLiveSportsChannels,
} from "./live/live-home/jl-sports/live-sports-channels";
import {
  ScoresStrip,
  SportChannelCards,
  SportsShortcuts,
  stripGames,
} from "./live/live-home/jl-sports/jl-sports-top";
import { useSportsPageWallpaper } from "./live/live-home/jl-sports/use-page-wallpaper";
import { JlSportsHero } from "./live/live-home/jl-sports/sports-hero";
import type { JlHubGame } from "./live/live-home/jl-sports/use-jl-sports";
import { useJlSportsPage } from "./live/live-home/jl-sports/use-jl-sports-page";

const NO_CHANNELS: IptvChannel[] = [];

const HotEvents = lazy(() => import("./sports/hot-events").then((m) => ({ default: m.HotEvents })));
const EsportsMatchRail = lazy(() =>
  import("./sports/esports-match-rail").then((m) => ({ default: m.EsportsMatchRail })),
);
const EsportsArena = lazy(() =>
  import("./sports/esports-hub").then((m) => ({ default: m.EsportsHub })),
);
const Personalize = lazy(() =>
  import("./sports/hub-personalize").then((m) => ({ default: m.HubPersonalize })),
);
const LinkedEsportsMatch = lazy(() =>
  import("./sports/esports-match").then((m) => ({ default: m.EsportsMatchView })),
);

export function SportsView({ active = false }: { active?: boolean }) {
  const { sportsEvent } = useView();
  return (
    <SportsAccessGate active={active}>
      {sportsEvent ? (
        <LinkedEsportsEvent match={sportsEvent} active={active} />
      ) : (
        <SportsHubView active={active} />
      )}
    </SportsAccessGate>
  );
}

function LinkedEsportsEvent({ match, active }: { match: EsportsMatch; active: boolean }) {
  const { goBack, openPlayer } = useView();
  return (
    <main className="sh-page">
      <Suspense fallback={null}>
        {active && (
          <LinkedEsportsMatch
            key={`${match.game}:${match.id}`}
            match={match}
            onClose={goBack}
            onWatch={(stream) => {
              const source = officialBroadcastSource(stream);
              if (source) openPlayer(source);
            }}
          />
        )}
      </Suspense>
    </main>
  );
}

function SportsHubView({ active = false }: { active?: boolean }) {
  const t = useT();
  const locale = useUiLanguage();
  const { settings } = useSettings();
  const fav = useFavourites();
  const sportPrefs = useSportPrefs();
  const jlTeams = useHubTeams();
  const jlPlayers = useJlFavoritePlayers();
  const discoveryTeams = useMemo(() => effectiveTeams(jlTeams, jlPlayers), [jlTeams, jlPlayers]);
  const { openMatchDetail } = useView();
  const scrollRef = useRef<HTMLElement>(null);
  useScrollMemory("sports", scrollRef, active);
  const { ref: sportRail, handlers: sportHandlers } = useDragScroll<HTMLDivElement>();
  const [tab, setTab] = useState("home");
  const [requestedGroup, setGroup] = useState("all");
  const [browsing, setBrowsing] = useState(false);
  const [esportsHeroTarget, setEsportsHeroTarget] = useState<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = bodyRef.current?.animate(
      [
        { opacity: 0.6, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 220, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [tab, requestedGroup]);
  const [today, setToday] = useState(() => dayStamp(new Date()));
  const [day, setDay] = useState(today);
  const [refresh, setRefresh] = useState(0);
  const [setup, setSetup] = useState(false);
  const eventTrigger = useRef<{ element: HTMLElement; label: string | null } | null>(null);
  useEffect(() => {
    if (!active || !eventTrigger.current) return;
    let attempts = 0;
    let frame = 0;
    const restore = () => {
      const saved = eventTrigger.current;
      // Schedule rows can be remounted by viewport virtualization while the page is parked.
      const target = saved?.element.isConnected
        ? saved.element
        : saved?.label
          ? scrollRef.current?.querySelector<HTMLElement>(
              `[aria-label="${CSS.escape(saved.label)}"]`,
            )
          : null;
      if (target?.getClientRects().length) {
        target.focus({ preventScroll: true });
        eventTrigger.current = null;
      } else if (++attempts < 20) frame = requestAnimationFrame(restore);
      else eventTrigger.current = null;
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  const [showTop, setShowTop] = useState(false);
  const [leagueFilter, setLeagueFilter] = useState("");
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setToday(dayStamp(new Date())), 60_000);
    return () => clearInterval(timer);
  }, [active]);
  const selected = useMemo(
    () =>
      selectedSportsLeagues(HUB_LEAGUES, settings.sportsLeagues, !!fav.personalized, [
        "NCAAF",
        "NFL",
        "NBA",
      ]),
    [settings.sportsLeagues, fav.personalized],
  );
  const scope = useMemo(
    () => sportsSelectionScope(HUB_LEAGUES, selected, requestedGroup, browsing, leagueFilter),
    [selected, requestedGroup, browsing, leagueFilter],
  );
  const { group, leagues } = scope;
  const personalGroups = HUB_GROUPS.filter(
    (g) => scope.groups.has(g.key) || (browsing && g.key === group),
  );
  const esportsLeagues = leagues.filter(
    (key) => HUB_LEAGUES.find((l) => l.key === key)?.group === "esports",
  );
  useEffect(() => {
    if (!setup) {
      setGroup("all");
      setLeagueFilter("");
      setBrowsing(false);
    }
  }, [settings.sportsLeagues]);
  const boardLeagues = useMemo(() => {
    if (tab === "live")
      return liveScoreboardKeys(HUB_LEAGUES.filter((l) => selected.includes(l.key)));
    if (scope.leagueFilter) return leagues;
    const others = leagues.filter((key) => {
      const def = HUB_LEAGUES.find((l) => l.key === key);
      return def?.group !== "soccer" || /^\d+$/.test(def.path);
    });
    return group === "soccer" ||
      (group === "all" &&
        leagues.some((key) => HUB_LEAGUES.find((l) => l.key === key)?.group === "soccer"))
      ? ["SOCCER_ALL", ...others]
      : others;
  }, [leagues, group, scope.leagueFilter, tab, selected]);
  const liveRange = useMemo(() => liveDateRange(today), [today]);
  const boardDay = tab === "live" ? liveRange : day;
  const boardFeed = useSportsHub(
    boardLeagues,
    boardDay,
    active && (tab === "live" || group !== "esports") && tab !== "hot" && tab !== "explore",
    refresh,
    tab === "live" ? "live" : "day",
  );
  const board = {
    ...boardFeed,
    games: useMemo(
      () => gamesInSportsSelection(boardFeed.games, HUB_LEAGUES, leagues),
      [boardFeed.games, leagues, tab],
    ),
  };
  const upcomingLeagues = useMemo(
    () => (browsing ? leagues.slice(0, 16) : leagues),
    [leagues, browsing],
  );
  const upcomingFeed = useSportsHub(
    upcomingLeagues,
    today,
    active && group !== "esports" && tab !== "hot" && tab !== "live" && tab !== "explore",
    refresh,
    "upcoming",
  );
  const upcoming = {
    ...upcomingFeed,
    games: useMemo(
      () => gamesInSportsSelection(upcomingFeed.games, HUB_LEAGUES, leagues),
      [upcomingFeed.games, leagues],
    ),
  };
  const all = useMemo(
    () =>
      mergeSlices([
        { at: 1, games: upcoming.games },
        { at: 2, games: board.games },
      ]),
    [board.games, upcoming.games],
  );
  const liveNow = useMemo(() => currentLiveGames(board.games), [board.games]);
  useEffect(() => syncSportsReminders(all), [all]);
  const next = useMemo(
    () => eventCards(all.filter((g) => g.state === "pre" && g.startMs >= Date.now())),
    [all],
  );
  const filtered = group === "all" ? all : all.filter((g) => hubLeague(g.league)?.group === group);
  const live = board.games.filter((g) => g.state === "in");
  const following = filtered.filter(
    (g) => isFavoriteGame(g, discoveryTeams) || fav.teams.some((team) => involvesTeam(g, team)),
  );
  const fights = next.filter((g) =>
    ["combat", "boxing"].includes(hubLeague(g.league)?.group || ""),
  );
  const coming = next.filter((g) =>
    group === "all"
      ? selected.some((k) => HUB_LEAGUES.find((l) => l.key === k)?.tag === g.league)
      : hubLeague(g.league)?.group === group,
  );
  const heroes = featuredEvents(
    live,
    group === "all" ? next : coming,
    (game) =>
      isFavoriteGame(game, discoveryTeams) || fav.teams.some((team) => involvesTeam(game, team)),
    leaguesForToday(sportPrefs, new Date()),
  );
  const pitchGame =
    board.games.find((g) => g.state === "in" && hubLeague(g.league)?.group === "soccer") ||
    board.games.find((g) => g.state === "pre" && hubLeague(g.league)?.group === "soccer");
  const open = (game: SportsGame) => {
    const trigger = document.activeElement;
    eventTrigger.current =
      trigger instanceof HTMLElement
        ? { element: trigger, label: trigger.getAttribute("aria-label") }
        : null;
    if (
      game.source === "thesportsdb-hub" ||
      game.source === "opendota" ||
      ["combat", "motorsport", "golf"].includes(hubLeague(game.league)?.group || "")
    )
      openMatchDetail(
        game,
        all.filter((item) => item.league === game.league && item.context?.id === game.context?.id),
      );
    else openMatchDetail(game);
  };
  // JL Media Vision's pieces of the hub: ranked Top 10, Game Stories, the viewer's own sports
  // channels and the Watch chooser that plays a game on them.
  const jl = useJlSportsPage({ active, onOpenGame: open, featured: heroes });
  const scopedJlGames = gamesInSportsSelection(jl.sports.games, HUB_LEAGUES, leagues);
  const personalHeroes = featuredEvents(
    [...live, ...scopedJlGames.filter((game) => game.state === "in")],
    [
      ...(group === "all" ? next : coming),
      ...scopedJlGames.filter(
        (game) =>
          game.state === "pre" &&
          game.startMs >= Date.now() &&
          (group === "all" || hubLeague(game.league)?.group === group),
      ),
    ],
    (game) =>
      isFavoriteGame(game, discoveryTeams) || fav.teams.some((team) => involvesTeam(game, team)),
    leaguesForToday(sportPrefs, new Date()),
  );
  const selectedTags = new Set(
    HUB_LEAGUES.filter((l) => selected.includes(l.key)).map((l) => l.tag),
  );
  const scopeTags = new Set(HUB_LEAGUES.filter((l) => leagues.includes(l.key)).map((l) => l.tag));
  const allowsGame = (game: SportsGame) => scopeTags.has(game.league);
  const pageFavorites = [
    ...discoveryTeams.map((team) => ({
      ...team,
      league: team.league === "NCAAB" ? "NCAA" : team.league,
    })),
    ...fav.teams.map((team) => ({
      id: team.id,
      name: team.name,
      league: HUB_LEAGUES.find((l) => l.key === team.leagueKey)?.tag ?? team.leagueKey,
    })),
  ];
  const rankedPool = mergeSlices([
    { at: 1, games: all },
    { at: 2, games: scopedJlGames },
  ]).filter((game) => game.state === "in" || game.startMs <= jl.nowMs + 7 * 86400000);
  const rankedPrefs = {
    ...sportPrefs,
    priority: [
      ...new Set([
        ...sportPrefs.priority
          .map((league) => (league === "NCAAB" ? "NCAA" : league))
          .filter((league) => scopeTags.has(league)),
        ...scopeTags,
      ]),
    ],
  };
  const pageNow = new Date(jl.nowMs);
  const pageTop = settings.sportsTopGames
    ? selectTopGames(
        rankGames(rankedPool, pageFavorites, {
          now: pageNow,
          prefs: rankedPrefs,
        }),
        followedGamesThisWeek(rankedPool, pageFavorites, pageNow),
      ).map((item) => ({ ...item, channels: jl.sports.channelsFor(item.game) }))
    : [];
  const pageTicker = jl.sports.ticker.filter((item) => allowsGame(item.game));
  const allowedChannelSports = useMemo(() => {
    const map: Record<string, SportCategory> = {
      football: "football",
      basketball: "basketball",
      baseball: "baseball",
      hockey: "hockey",
      soccer: "soccer",
      combat: "combat",
      boxing: "combat",
      motorsport: "racing",
      golf: "golf-tennis",
      tennis: "golf-tennis",
    };
    return [
      ...new Set<SportCategory>([
        ...HUB_LEAGUES.filter((l) => selected.includes(l.key)).flatMap((l) =>
          map[l.group] ? [map[l.group]] : [],
        ),
        ...(selected.some((league) => league === "NCAAF" || league === "NCAAB")
          ? ["college" as const]
          : []),
      ]),
    ];
  }, [selected]);
  const jlTopKeys = new Set(pageTop.map((r) => `${r.game.league}:${r.game.id}`));
  const jlFeatured: JlHubGame[] = heroFeatured(personalHeroes, jlTopKeys).map((game) => ({
    game,
    score: 0,
    reasons: [],
    mine: false,
    channels: jl.sports.channelsFor(game),
  }));
  const jlHome = tab === "home" && group !== "esports";
  // JL's pieces follow the viewer's own sports, not a single sport or league picked below.
  const jlAll = jlHome && group === "all" && !scope.leagueFilter;
  const jlHero =
    jlHome &&
    jl.sports.top.length +
      jl.sports.teamSlides.length +
      jl.sports.playerSlides.length +
      jlFeatured.length >
      0;
  // Harbor's schedule already lists every game of the leagues it shows, so "Also today" only
  // keeps the leagues it doesn't.
  const scheduleTags = new Set([
    ...board.games.map((g) => g.league),
    ...HUB_LEAGUES.filter((l) => leagues.includes(l.key)).map((l) => l.tag),
  ]);
  const jlAlsoToday = jl.sports.alsoToday.filter(
    (g) => selectedTags.has(g.league) && !scheduleTags.has(g.league),
  );
  // The viewer's sports channels, classified once for the photo cards and the full browser.
  const jlChannels = useLiveSportsChannels({
    active: active && jlAll,
    channels: jlAll ? jl.channels : NO_CHANNELS,
    activeSourceId: jl.activeSourceId,
    epg: jl.epg,
    nowMs: jl.nowMs,
    games: pageTop,
    allowedSports: allowedChannelSports,
    onPlay: jl.play,
  });
  const jlScores = stripGames(jl.sports.games.filter(allowsGame));
  const jlLeagues = () => {
    setTab("explore");
    setGroup("all");
  };
  const wallpaperStyle = useSportsPageWallpaper();
  // For you leads with the Sports Wallpaper slider and Top 10, above the Sports Hub itself.
  const lead = tab === "home" && group !== "esports";
  const homeHidden = sportsHomeHidden(settings.sportsHomeHidden);
  const busy =
    tab !== "hot" &&
    tab !== "explore" &&
    (tab === "live" || group !== "esports") &&
    (board.pending > 0 || (tab !== "live" && upcoming.pending > 0));
  const failures =
    group === "esports" && tab !== "live"
      ? 0
      : board.failed + (tab === "live" ? 0 : upcoming.failed);
  const statusStale = board.stale || (tab !== "live" && upcoming.stale);
  const brokenLeagues = useMemo(
    () => [
      ...new Set(
        [...board.failedKeys, ...(tab === "live" ? [] : upcoming.failedKeys)]
          .map((key) => key.split("@")[0])
          .map((key) =>
            key === "SOCCER_ALL"
              ? "Soccer"
              : HUB_LEAGUES.find((l) => l.key === key)?.labelEn || key,
          ),
      ),
    ],
    [board.failedKeys, upcoming.failedKeys, tab],
  );
  const brokenShown =
    brokenLeagues.slice(0, 3).join(", ") +
    (brokenLeagues.length > 3 ? ` +${brokenLeagues.length - 3}` : "");
  const latest = board.at || (tab === "live" ? 0 : upcoming.at);
  const days = buildDays(new Date(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8)));
  const dateTitle = new Date(
    +day.slice(0, 4),
    +day.slice(4, 6) - 1,
    +day.slice(6, 8),
  ).toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });
  return (
    <main
      ref={scrollRef}
      className="sports-hub"
      onScroll={(e) => setShowTop(e.currentTarget.scrollTop > 700)}
      aria-label={t("Sports")}
      style={wallpaperStyle}
    >
      {lead && (
        <>
          {!homeHidden.includes("hero") && jlHero && (
            <div data-sports-shelf="hero">
              <JlSportsHero
                top={pageTop}
                teamSlides={jl.sports.teamSlides.filter((s) =>
                  scopeTags.has(s.team.league === "NCAAB" ? "NCAA" : s.team.league),
                )}
                playerSlides={jl.sports.playerSlides.filter((s) =>
                  scopeTags.has(s.player.league === "NCAAB" ? "NCAA" : s.player.league),
                )}
                featured={jlFeatured}
                actions={jl.actions}
                onOpenGame={open}
                bleed
                flush
              />
            </div>
          )}
          {!homeHidden.includes("top10") && jlAll && (
            <div className="sh-body sh-lead-top10" data-sports-shelf="top10">
              <JlSportsHub
                top={pageTop}
                ticker={pageTicker}
                favorites={jl.sports.teams}
                actions={jl.actions}
                onOpenGame={open}
                onLeagues={jlLeagues}
                shortcuts={false}
              />
            </div>
          )}
        </>
      )}
      <header className={`sh-masthead${lead ? " sh-masthead-below" : ""}`}>
        <div>
          <span className="sh-eyebrow">JL SPORTS</span>
          <h1>{t("Your Sports Hub")}</h1>
        </div>
        <SportsPersonalizeHint active={active && !setup} onPersonalize={() => setSetup(true)} />
      </header>
      <nav className="sh-view-tabs" aria-label={t("Sports navigation")}>
        {[
          ["home", "For you"],
          ["live", "Live now"],
          ["schedule", "Schedule"],
          ["explore", "Explore sports"],
          ["hot", "Hot Events"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              if (key === "home" || key === "live") {
                setLeagueFilter("");
                setGroup("all");
                setBrowsing(false);
              }
            }}
          >
            {t(label)}
          </button>
        ))}
        {tab !== "hot" && (
          <span
            className="sh-update-status"
            role="status"
            title={brokenLeagues.length ? brokenLeagues.join(", ") : undefined}
          >
            {busy
              ? t("Updating schedules…")
              : failures || statusStale
                ? t("Some schedules are unavailable")
                : t("Up to date")}
          </span>
        )}
        <SportsRefreshButton busy={busy} onRefresh={() => setRefresh((n) => n + 1)} />
      </nav>
      {tab === "home" && group === "esports" && !browsing && (
        <div className="sh-carousel" ref={setEsportsHeroTarget} />
      )}
      <div className="sh-body" ref={bodyRef}>
        <SportsNoProviderNote />
        {tab !== "explore" && tab !== "hot" && tab !== "live" && (
          <div
            ref={sportRail}
            {...sportHandlers}
            className="sh-sport-tabs"
            aria-label={t("Filter by sport")}
          >
            <button
              aria-pressed={group === "all"}
              onClick={() => {
                setGroup("all");
                setLeagueFilter("");
                setBrowsing(false);
              }}
            >
              {t("Your sports")}
            </button>
            {personalGroups.map((g) => (
              <button
                key={g.key}
                aria-pressed={group === g.key}
                onClick={() => {
                  setGroup(g.key);
                  setLeagueFilter("");
                  setBrowsing(browsing && g.key === group && !scope.groups.has(g.key));
                }}
              >
                <SportIcon name={g.key} size={20} />
                {getGroupLabel(g)}
              </button>
            ))}
            <button
              onClick={() => {
                setTab("explore");
                setGroup("all");
              }}
            >
              {t("All sports")}
              <ArrowRight size={14} />
            </button>
          </div>
        )}
        {tab !== "explore" && tab !== "hot" && tab !== "live" && group !== "esports" && (
          <>
            <div className="sh-date-dock">
              <button
                className="sh-icon"
                aria-label={t("Jump to today")}
                onClick={() => setDay(today)}
              >
                <CalendarDays size={18} />
              </button>
              <SportsDateBar
                days={days}
                selected={day}
                today={today}
                liveDays={new Set(live.map((game) => dayStamp(new Date(game.startMs))))}
                onSelect={setDay}
              />
              <label className="sh-calendar-input" title={t("Choose date")}>
                <CalendarDays size={18} />
                <input
                  type="date"
                  aria-label={t("Choose date")}
                  value={`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`}
                  onChange={(e) => {
                    if (e.target.value) setDay(e.target.value.replaceAll("-", ""));
                  }}
                />
              </label>
              <SportsSelect
                className="sh-league-select"
                ariaLabel={t("Filter by league")}
                value={scope.leagueFilter}
                onChange={setLeagueFilter}
                options={[
                  {
                    value: "",
                    label: t("All leagues"),
                    left: <SportIcon name="trophy" size={20} />,
                  },
                  ...scope.options.map((l) => ({
                    value: l.key,
                    label: getLeagueLabel(l),
                    left: <LeagueLogo league={l} size={20} />,
                  })),
                ]}
              />
            </div>
          </>
        )}
        {tab !== "hot" && group !== "esports" && (statusStale || failures > 0) && (
          <div className="sh-feed-note" role="status">
            <span>
              {t(
                tab === "live"
                  ? "Some live scores are unavailable."
                  : statusStale
                    ? "Showing saved schedules while feeds reconnect."
                    : "Some feeds did not respond. Available events are still shown.",
              )}
              {brokenLeagues.length > 0 && ` · ${brokenShown}`}
              {latest > 0 &&
                ` · ${t("Last update")} ${new Date(latest).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`}
            </span>
            <button
              className="sh-text-button"
              disabled={busy}
              onClick={() => setRefresh((n) => n + 1)}
            >
              {t("Retry")}
            </button>
          </div>
        )}
        {tab !== "explore" && tab !== "hot" && tab !== "live" && group === "esports" && (
          <Suspense fallback={<SportsRailSkeleton />}>
            {browsing ? (
              <EsportsArena active={active && !setup} refresh={refresh} />
            ) : (
              <EsportsMatchRail
                heroTarget={tab === "home" ? esportsHeroTarget : null}
                leagueKeys={leagues}
                active={active && !setup}
                refresh={refresh}
                onExplore={() => setBrowsing(true)}
              />
            )}
          </Suspense>
        )}
        {tab === "home" && group !== "esports" && (
          <SportsHomeLayout
            onSports={() => setSetup(true)}
            pinned={["hero", "top10"]}
            items={[
              {
                id: "stories",
                content: jlAll ? (
                  <GameStoriesRow
                    stories={jl.stories.filter((item) => allowsGame(item.game))}
                    onWatch={jl.actions.watch}
                    onOpenGame={open}
                    aside={<SportsShortcuts actions={jl.actions} onLeagues={jlLeagues} />}
                  />
                ) : null,
              },
              {
                id: "channel-cards",
                content: jlAll ? (
                  <SportChannelCards data={jlChannels} favorites={jl.sports.teams} />
                ) : null,
              },
              {
                id: "scores",
                content: jlAll ? <ScoresStrip games={jlScores} onOpenGame={open} /> : null,
              },
              {
                id: "featured",
                content: (
                  <HubCarousel
                    games={personalHeroes}
                    active={active && !setup}
                    onOpen={open}
                    onCustomize={() => setSetup(true)}
                    loading={busy}
                    stale={board.stale || upcoming.stale}
                  />
                ),
              },
              {
                id: "live",
                content: (
                  <HubRow title={t("Live now")} games={live} onOpen={open} stale={board.stale} />
                ),
              },
              {
                id: "your-teams",
                content: (
                  <HubRow
                    title={t("Your teams")}
                    games={following.filter((g) => g.state !== "post")}
                    onOpen={open}
                    stale={board.stale || upcoming.stale}
                  />
                ),
              },
              {
                id: "coming-up",
                content: (
                  <HubRow
                    title={t("Coming up")}
                    games={diverseEvents(coming)}
                    onOpen={open}
                    stale={upcoming.stale}
                  />
                ),
              },
              {
                id: "fight-nights",
                content: fights.length ? (
                  <HubRow
                    title={t("Fight nights")}
                    games={fights}
                    onOpen={open}
                    stale={upcoming.stale}
                  />
                ) : null,
              },
              {
                id: "channels",
                content: jlAll ? <LiveSportsChannelsView data={jlChannels} /> : null,
              },
              {
                id: "pitch",
                content: pitchGame ? (
                  <HubPitchSpotlight game={pitchGame} active={active} onOpen={open} />
                ) : null,
              },
              {
                id: "esports",
                content:
                  group === "all" && esportsLeagues.length > 0 ? (
                    <Suspense fallback={<SportsRailSkeleton />}>
                      <EsportsMatchRail
                        leagueKeys={esportsLeagues}
                        active={active && !setup}
                        refresh={refresh}
                        onExplore={() => {
                          setBrowsing(true);
                          setGroup("esports");
                          setLeagueFilter("");
                          scrollRef.current?.scrollTo({ top: 0 });
                        }}
                      />
                    </Suspense>
                  ) : null,
              },
              {
                id: "schedule",
                content: (
                  <HubSchedule
                    title={dateTitle}
                    games={board.games}
                    onOpen={open}
                    stale={board.stale}
                    loading={board.pending > 0}
                    failed={board.failed > 0}
                  />
                ),
              },
              {
                id: "also-today",
                content: jlAll ? (
                  <AlsoToday
                    groups={jlAlsoToday}
                    favorites={jl.sports.teams}
                    actions={jl.actions}
                    onOpenGame={open}
                  />
                ) : null,
              },
            ]}
          />
        )}
        {tab === "live" && (
          <>
            <HubSchedule
              key="live-now"
              title={t("Live now")}
              games={liveNow}
              onOpen={open}
              stale={board.stale}
              loading={busy}
              failed={failures > 0 || board.stale}
              liveOnly
            />
            {esportsLeagues.length > 0 && (
              <Suspense fallback={<SportsRailSkeleton />}>
                <EsportsMatchRail
                  liveOnly
                  active={active && !setup}
                  refresh={refresh}
                  onExplore={() => {
                    setTab("home");
                    setBrowsing(true);
                    setGroup("esports");
                    setLeagueFilter("");
                    scrollRef.current?.scrollTo({ top: 0 });
                  }}
                />
              </Suspense>
            )}
          </>
        )}
        {tab === "schedule" && group !== "esports" && (
          <HubSchedule
            title={dateTitle}
            games={board.games}
            onOpen={open}
            stale={board.stale}
            loading={board.pending > 0}
            failed={board.failed > 0}
          />
        )}
        {tab === "hot" && (
          <Suspense fallback={<SportsHotEventsSkeleton />}>
            <HotEvents
              seed={[...all, ...jl.sports.games]}
              active={active && !setup}
              refresh={refresh}
              favourites={fav.teams}
              leagueKeys={selected}
              onOpen={open}
              onExplore={() => setTab("explore")}
            />
          </Suspense>
        )}
        {tab === "explore" && (
          <SportsExplorer
            onSport={(key) => {
              setBrowsing(true);
              setGroup(key);
              setLeagueFilter("");
              setTab("home");
              scrollRef.current?.scrollTo({ top: 0 });
            }}
          />
        )}
        <footer className="sh-footer">
          <span>{t("Schedules and scores: ESPN · TheSportsDB")}</span>
          <span>{t("Coverage varies by league. Streams depend on your available sources.")}</span>
          <span>
            {t(
              "Use only sources you are authorized to access. Harbor does not bypass subscriptions or access restrictions.",
            )}
          </span>
        </footer>
      </div>
      {showTop && (
        <button
          className="sh-back-top"
          aria-label={t("Back to top")}
          onClick={() => {
            scrollRef.current?.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            });
            scrollRef.current
              ?.querySelector<HTMLButtonElement>(".sh-masthead button")
              ?.focus({ preventScroll: true });
          }}
        >
          <ArrowUp size={18} />
          {t("Back to top")}
        </button>
      )}
      {jl.dialogs}
      <Suspense fallback={null}>
        {setup && <Personalize selected={selected} onClose={() => setSetup(false)} />}{" "}
      </Suspense>
    </main>
  );
}
