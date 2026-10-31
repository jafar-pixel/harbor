import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Radio } from "lucide-react";
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
} from "@/lib/sports/hub-chips";
import { HUB_LEAGUES, hubLeague } from "@/lib/sports/hub-data";
import { hotEventCalendarParts } from "@/lib/sports/hot-events";
import { gameKey } from "@/lib/sports/hub-cache";
import type { LiveSportsChannelsData } from "@/views/live/live-home/jl-sports/live-sports-channels";
import { HotPoster, HotTeamTitle, hotEventTitle, useHotFeed, WeekLogos } from "./hot-events";
import { LeagueLogo } from "./league-logo";
import { SportIcon } from "./sport-icon";
import { SportsTvScreen } from "./sports-tv-screen";
import { tuneOrWatch, useSportsTvTuned, type SportsTvTuned } from "./sports-tv-tuner";

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
}) {
  const t = useT();
  const locale = useUiLanguage();
  const chips = useMemo(() => hubChips(selected, HUB_LEAGUES), [selected]);
  const feedKeys = useMemo(() => hubFeedLeagues(chips, HUB_LEAGUES), [chips]);
  const { games, now, loading } = useHotFeed(seed, feedKeys, active, refresh);

  const [chip, setChip] = useState<string>(() => readStored<string>(CHIP_KEY, "all"));
  const chipKeys = chips.map((c) => c.key);
  const current = chipKeys.includes(chip) ? chip : "all";
  const pickChip = (key: string) => {
    setChip(key);
    store(CHIP_KEY, key);
  };
  const [mode, setMode] = useState<Mode>(() =>
    readStored<Mode>(MODE_KEY, "today", ["tv", "today", "week"]),
  );
  const pickMode = (m: Mode) => {
    setMode(m);
    store(MODE_KEY, m);
  };

  const inChip = useMemo(() => gamesForChip(games, chips, current), [games, chips, current]);
  const today = useMemo(() => liveTodayGames(inChip, now), [inChip, now]);
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

  // Today's games, with the channel each is on, for the full player's side panel.
  useEffect(() => {
    if (!active) return;
    publishLiveToday(
      today.map((g) => ({
        key: gameKey(g),
        title: hotEventTitle(g),
        score: scoreLine(g),
        detail: g.detail,
        live: g.state === "in",
        channel: channelsFor(g)[0]?.channel ?? null,
      })),
    );
  }, [active, today, channelsFor]);

  const tuned = useSportsTvTuned();
  const posters = mode === "week" ? week : today;

  return (
    <section className="hot-events" aria-label={t("Hub")}>
      <div className="hot-filters">
        <div
          role="group"
          aria-label={t("Filter by sport")}
          className="harbor-scroll flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
        >
          <button
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
            aria-pressed={current === "all"}
            onClick={() => pickChip("all")}
          >
            <SportIcon name="trophy" size={18} /> {t("All sports")}
          </button>
          {chips.map((c) => (
            <button
              key={c.key}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
              aria-pressed={current === c.key}
              onClick={() => pickChip(c.key)}
            >
              {c.league ? (
                <LeagueLogo league={hubLeague(c.league.tag)!} size={20} />
              ) : (
                <SportIcon name="esports" size={18} />
              )}{" "}
              {c.league ? getLeagueLabel(hubLeague(c.league.tag)!) : t("Esports")}
            </button>
          ))}
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
        </div>
      </div>

      {/* The TV stays put while the posters scroll underneath. */}
      <div className="sticky top-0 z-30 -mx-2 grid gap-4 bg-canvas/85 px-2 py-3 backdrop-blur-xl lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
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
        <aside className="hot-week harbor-scroll h-[clamp(300px,46vh,560px)] overflow-y-auto">
          <div>
            <h3>
              {mode === "tv"
                ? t("Sports channels")
                : mode === "today"
                  ? t("Live Today")
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
                        tuneOrWatch(
                          {
                            key: `ch:${e.key}`,
                            title: e.title,
                            live: e.liveNow,
                            channels: e.channels,
                          },
                          onWatch,
                        )
                      }
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
            : (mode === "today" ? today : week).map((g) => {
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
                      onClick={() => tuneOrWatch(gameTuned(g), onWatch)}
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
          {mode !== "tv" && !(mode === "today" ? today : week).length && (
            <p>{loading ? t("Loading games…") : t("No games scheduled.")}</p>
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
