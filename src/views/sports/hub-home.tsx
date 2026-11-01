import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Radio, SlidersHorizontal } from "lucide-react";
import { useT, useUiLanguage } from "@/lib/i18n";
import type { IptvChannel } from "@/lib/iptv/types";
import type { GameChannel } from "@/lib/jl/sports/channels";
import { qualityLabel } from "@/lib/jl/sports/channels";
import { chipTvLeague } from "@/lib/jl/sports/chip-tv-league";
import { publishLiveToday } from "@/lib/jl/sports/live-today-store";
import { tvLeagueOf } from "@/lib/jl/sports/tv-leagues";
import { getLeagueLabel, type SportsGame } from "@/lib/sports/espn";
import {
  ESPORTS_CHIP,
  gamesForChip,
  hubChips,
  hubFeedLeagues,
  liveTodayGames,
  nextSevenDays,
  topRankedGames,
  type HubChip,
} from "@/lib/sports/hub-chips";
import { HUB_LEAGUES, hubLeague } from "@/lib/sports/hub-data";
import { hotEventCalendarParts } from "@/lib/sports/hot-events";
import { gameKey } from "@/lib/sports/hub-cache";
import { reminderId, useSportsReminders } from "@/lib/sports/reminders";
import type { LiveSportsChannelsData } from "@/views/live/live-home/jl-sports/live-sports-channels";
import { HubGameDetails } from "./hub-game-details";
import { nativeTvAvailable } from "@/lib/player/native-tv/shell";
import { requestSmallTvFull } from "@/lib/player/native-tv/small-screen";
import { HotPoster, HotTeamTitle, hotEventTitle, useHotFeed, WeekLogos } from "./hot-events";
import { LeagueLogo } from "./league-logo";
import { SportIcon } from "./sport-icon";
import { SportsTvScreen } from "./sports-tv-screen";
import { tuneSportsTv, useSportsTvTuned, type SportsTvTuned } from "./sports-tv-tuner";

type Mode = "tv" | "today" | "week";

const CHIP_KEY = "jl.sports.hub.chip.v1";
const MODE_KEY = "jl.sports.hub.mode.v1";

function readStored<T extends string>(key: string, fallback: T, allowed?: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && (!allowed || allowed.includes(v)) ? v : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

const scoreLine = (g: SportsGame) =>
  g.state === "pre" ? null : `${g.away.score ?? ""} - ${g.home.score ?? ""}`;

/**
 * The Sports Hub landing page: the viewer's sports as a row of chips, then Sport TV, Live Today
 * and Next 7 days over a fixed TV screen. A click puts a game or channel on the TV, a second
 * click (or Watch) opens it full screen; Next 7 days lays the week out as posters underneath.
 */
export function SportsHubHome({
  seed,
  selected,
  active,
  refresh,
  channels,
  channelsFor,
  onWatch,
  onOpen,
  onCalendar,
  onPersonalize,
}: {
  seed: SportsGame[];
  /** League keys from Personalize. */
  selected: string[];
  active: boolean;
  refresh: number;
  channels: LiveSportsChannelsData;
  channelsFor: (game: SportsGame) => GameChannel[];
  onWatch: (channel: IptvChannel) => void;
  onOpen: (game: SportsGame) => void;
  onCalendar: () => void;
  /** Opens Personalize to choose the sports shown here. */
  onPersonalize: () => void;
}) {
  const t = useT();
  const locale = useUiLanguage();
  const chips = useMemo(() => hubChips(selected, HUB_LEAGUES), [selected]);
  const feedKeys = useMemo(() => hubFeedLeagues(chips, HUB_LEAGUES), [chips]);
  const { games, now, loading } = useHotFeed(seed, feedKeys, active, refresh);

  const [chip, setChip] = useState<string>(() => readStored<string>(CHIP_KEY, "all"));
  const chipKeys = chips.map((c) => c.key);
  const current = chipKeys.includes(chip) ? chip : "all";
  const [sportsOpen, setSportsOpen] = useState(false);
  const pickChip = (key: string) => {
    setChip(key);
    store(CHIP_KEY, key);
    setSportsOpen(false);
  };
  const currentChip = chips.find((c) => c.key === current) ?? null;
  const chipLabel = (c: HubChip | null) =>
    !c ? t("All sports") : c.league ? getLeagueLabel(hubLeague(c.league.tag)!) : t("Esports");
  const [mode, setMode] = useState<Mode>(() =>
    readStored<Mode>(MODE_KEY, "today", ["tv", "today", "week"]),
  );
  const pickMode = (m: Mode) => {
    setMode(m);
    store(MODE_KEY, m);
  };

  const inChip = useMemo(() => gamesForChip(games, chips, current), [games, chips, current]);
  const chipLeague = chips.find((c) => c.key === current)?.league?.key ?? null;
  const today = useMemo(
    () => topRankedGames(liveTodayGames(inChip, now), chipLeague),
    [inChip, now, chipLeague],
  );
  const topList = today.some((g) => (g.home.rank ?? 99) <= 25 || (g.away.rank ?? 99) <= 25);
  const week = useMemo(() => nextSevenDays(inChip, now), [inChip, now]);

  const tvLeague = chipTvLeague(chips.find((c) => c.key === current));
  const entries = useMemo(() => {
    if (current === ESPORTS_CHIP) return [];
    if (current === "all") return channels.entries;
    return channels.entries.filter((e) => {
      const ch = e.channels[0];
      return (
        tvLeague &&
        tvLeagueOf({ group: ch.group, name: ch.name, title: e.title }, e.sport) === tvLeague
      );
    });
  }, [channels.entries, current, tvLeague]);

  const gameTuned = (g: SportsGame): SportsTvTuned => ({
    key: `game:${gameKey(g)}`,
    title: hotEventTitle(g),
    subtitle: [hubLeague(g.league) ? getLeagueLabel(hubLeague(g.league)!) : g.league, scoreLine(g)]
      .filter(Boolean)
      .join(" · "),
    live: g.state === "in",
    channels: channelsFor(g).map((c) => c.channel),
  });

  // The watch list beside the TV: games on now, then today's games with a reminder, soonest
  // first. Games that haven't started are posters underneath, each with Remind me; a reminder
  // adds the game here. The full player's side panel lists the same games.
  const reminders = useSportsReminders();
  const reminded = useMemo(() => new Set(reminders.map((r) => r.id)), [reminders]);
  const watchList = useMemo(
    () => [
      ...today.filter((g) => g.state === "in"),
      ...today.filter((g) => g.state === "pre" && reminded.has(reminderId(g))),
    ],
    [today, reminded],
  );
  const upcomingToday = useMemo(() => today.filter((g) => g.state === "pre"), [today]);
  useEffect(() => {
    if (!active) return;
    publishLiveToday(
      watchList.map((g) => ({
        key: gameKey(g),
        title: hotEventTitle(g),
        score: scoreLine(g),
        detail: g.detail,
        live: g.state === "in",
        channel: channelsFor(g)[0]?.channel ?? null,
        reminded: reminded.has(reminderId(g)),
      })),
    );
  }, [active, watchList, channelsFor, reminded]);

  const tuned = useSportsTvTuned();
  const tunedGame = useMemo(
    () => [...today, ...week].find((g) => tuned?.key === `game:${gameKey(g)}`) ?? null,
    [today, week, tuned?.key],
  );
  const posters = mode === "week" ? week : upcomingToday;
  const sideGames = mode === "today" ? watchList : week;
  // One click puts a game on the Sports TV; a double click opens it full screen.
  const watchNow = (channels: IptvChannel[]) => {
    if (channels[0]) onWatch(channels[0]);
  };
  // A remote has no double click: on the Shield, OK on what's already on the TV goes full screen.
  const tvTune = (next: SportsTvTuned) => {
    if (nativeTvAvailable() && tuned?.key === next.key) requestSmallTvFull();
    else tuneSportsTv(next);
  };

  return (
    <section className="hot-events" aria-label={t("Hub")}>
      <div className="hot-filters">
        <div role="group" aria-label={t("Show")}>
          {(
            [
              ["tv", "Sport TV"],
              ["today", "Live Today"],
              ["week", "Next 7 days"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} aria-pressed={mode === key} onClick={() => pickMode(key)}>
              {t(label)}
            </button>
          ))}
          <button
            className="inline-flex items-center gap-2 whitespace-nowrap"
            aria-pressed={sportsOpen}
            aria-expanded={sportsOpen}
            onClick={() => setSportsOpen((v) => !v)}
          >
            {currentChip?.league ? (
              <LeagueLogo league={hubLeague(currentChip.league.tag)!} size={18} />
            ) : (
              <SportIcon name={current === ESPORTS_CHIP ? "esports" : "trophy"} size={16} />
            )}
            {chipLabel(currentChip)}
            <ChevronDown
              size={15}
              className={`transition-transform ${sportsOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>
        <button
          type="button"
          className="hot-edition"
          onClick={onCalendar}
          aria-label={t("Open the calendar")}
        >
          <CalendarDays size={16} />
          {new Date(now).toLocaleDateString(locale, { month: "long", day: "numeric" })}
        </button>
      </div>

      {sportsOpen && (
        <div
          role="group"
          aria-label={t("Your sports")}
          className="hot-sport-strip harbor-scroll -mt-3 mb-5 flex gap-2 overflow-x-auto pb-1"
        >
          <button
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
            aria-pressed={current === "all"}
            onClick={() => pickChip("all")}
          >
            <SportIcon name="trophy" size={16} /> {t("All sports")}
          </button>
          {chips.map((c) => (
            <button
              key={c.key}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
              aria-pressed={current === c.key}
              onClick={() => pickChip(c.key)}
            >
              {c.league ? (
                <LeagueLogo league={hubLeague(c.league.tag)!} size={18} />
              ) : (
                <SportIcon name="esports" size={16} />
              )}
              {chipLabel(c)}
            </button>
          ))}
          <button
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
            aria-pressed={false}
            onClick={onPersonalize}
          >
            <SlidersHorizontal size={15} /> {t("Choose sports")}
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="h-[clamp(300px,46vh,560px)]">
            <SportsTvScreen
              tuned={tuned}
              active={active}
              sourceNames={channels.sourceNames}
              onWatch={onWatch}
              emptyText={t(
                "Pick a game or a channel to put it on. Click it again to watch full screen.",
              )}
            />
          </div>
          {tunedGame && <HubGameDetails game={tunedGame} onOpen={onOpen} />}
        </div>
        <aside className="hot-week harbor-scroll max-h-[calc(clamp(300px,46vh,560px)+260px)] self-start overflow-y-auto">
          <div>
            <h3>
              {mode === "tv"
                ? t("Sports channels")
                : mode === "today"
                  ? topList
                    ? t("Top 25 · watch list")
                    : t("Watch list")
                  : t("This week")}
            </h3>
          </div>
          {mode === "tv"
            ? entries.map((e) => {
                const ch = e.channels[0];
                const q = qualityLabel(ch.name);
                return (
                  <article
                    className="hot-week-item"
                    key={e.key}
                    aria-current={tuned?.key === `ch:${e.key}`}
                  >
                    <button
                      className="sh-event-open"
                      onClick={() =>
                        tvTune({
                          key: `ch:${e.key}`,
                          title: e.title,
                          live: e.liveNow,
                          channels: e.channels,
                        })
                      }
                      onDoubleClick={() => watchNow(e.channels)}
                      aria-label={e.title}
                    />
                    <span className="hot-week-logos is-event">
                      {ch.logo ? (
                        <img
                          src={ch.logo}
                          alt=""
                          draggable={false}
                          className="max-h-9 max-w-[52px] object-contain"
                        />
                      ) : (
                        <Radio size={22} />
                      )}
                    </span>
                    <span className="hot-week-copy">
                      <small>
                        {e.liveNow ? `● ${t("Live")} · ` : ""}
                        {ch.name}
                        {q ? ` · ${q}` : ""}
                      </small>
                      <strong dir="auto">{e.title}</strong>
                    </span>
                  </article>
                );
              })
            : sideGames.map((g) => {
                const cal = hotEventCalendarParts(g, locale);
                const league = hubLeague(g.league);
                const score = scoreLine(g);
                return (
                  <article
                    className="hot-week-item"
                    key={gameKey(g)}
                    aria-current={tuned?.key === `game:${gameKey(g)}`}
                  >
                    <button
                      className="sh-event-open"
                      onClick={() => tvTune(gameTuned(g))}
                      onDoubleClick={() => watchNow(channelsFor(g).map((c) => c.channel))}
                      aria-label={hotEventTitle(g)}
                    />
                    <time dateTime={cal.dateTime}>
                      <b>{cal.day}</b>
                      <small>{cal.month}</small>
                    </time>
                    <WeekLogos game={g} />
                    <span className="hot-week-copy">
                      <small>
                        {g.state === "in" ? `● ${t("Live")} · ` : ""}
                        {g.state === "pre" && mode === "today"
                          ? `${new Date(g.startMs).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })} · `
                          : ""}
                        {league ? getLeagueLabel(league) : g.league}
                        {score ? ` · ${score}` : ""}
                        {g.state !== "pre" && g.detail ? ` · ${g.detail}` : ""}
                      </small>
                      <strong>
                        <HotTeamTitle game={g} />
                      </strong>
                    </span>
                  </article>
                );
              })}
          {mode === "tv" && !entries.length && (
            <p>{t("None of your providers has channels for this sport.")}</p>
          )}
          {mode !== "tv" && !sideGames.length && (
            <p>
              {loading
                ? t("Loading games…")
                : mode === "today"
                  ? t("No games on right now. Tap Remind me on a game below to add it here.")
                  : t("No games scheduled.")}
            </p>
          )}
        </aside>
      </div>

      {mode !== "tv" && posters.length > 0 && (
        <>
          <div className="hot-section-title">
            <h3>{mode === "week" ? t("Next 7 days") : t("Today")}</h3>
            <span>{t("{n} events", { n: posters.length })}</span>
          </div>
          <div className="hot-grid">
            {posters.map((g) => (
              <HotPoster key={gameKey(g)} game={g} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
