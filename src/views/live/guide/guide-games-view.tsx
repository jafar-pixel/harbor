import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Star, Tv } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { EpgIndex, IptvChannel } from "@/lib/iptv/types";
import { channelsForGame, qualityLabel, type GameChannel } from "@/lib/jl/sports/channels";
import { effectiveTeams, useJlFavoritePlayers } from "@/lib/jl/sports/favorites";
import {
  defaultGuideFilter,
  guideFilterLeagues,
  matchesGuideFilter,
  nextGuideGame,
  selectGuideGames,
  type GuideGame,
  type GuideGamesFilter,
} from "@/lib/jl/sports/guide-games";
import { watchGameOn } from "@/lib/jl/sports/now-watching";
import { visibleScore } from "@/lib/jl/sports/presentation";
import { SPORT_CHOICES } from "@/lib/jl/sports/sport-priorities";
import { tickerTeamName } from "@/lib/jl/sports/ticker";
import { useSettings } from "@/lib/settings";
import type { SportsGame } from "@/lib/sports/espn";
import { useView } from "@/lib/view";
import { fmtClock } from "../live-home/now-format";
import {
  useHubTeams,
  useJlGames,
  useSportPrefs,
  useSportsChannelIndex,
} from "../live-home/jl-sports/use-jl-sports";
import { WatchChooser } from "../live-home/jl-sports/watch-chooser";

// The scoreboards arrive a moment after the view opens; until then "no games" would be a guess.
const FIRST_LOAD_MS = 10_000;

type Row = GuideGame<GameChannel>;
type Translate = ReturnType<typeof useT>;

const LEAGUE_LABELS = new Map(SPORT_CHOICES.map((c) => [c.league, c.label] as const));

function matchup(game: SportsGame, t: Translate): string {
  return `${tickerTeamName(game.away, game.league)} ${t("at")} ${tickerTeamName(game.home, game.league)}`;
}

function startLabel(startMs: number, nowMs: number, t: Translate): string {
  const sameDay = new Date(startMs).toDateString() === new Date(nowMs).toDateString();
  if (sameDay) return fmtClock(startMs);
  const day = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(startMs);
  return t("{day} {time}", { day, time: fmtClock(startMs) });
}

/**
 * The Live TV Guide's "Games" view: one row per game on the viewer's channels that is live now or
 * starts within four hours, best channel first. Activating a row plays that channel the way the
 * Sports Hub's Watch does.
 */
export function GuideGamesView({
  channels,
  epg,
  nowMs,
  onPlay,
}: {
  channels: IptvChannel[];
  epg: EpgIndex | null;
  nowMs: number;
  onPlay: (ch: IptvChannel) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const { openMatchDetail } = useView();
  const prefs = useSportPrefs();
  const teams = useHubTeams();
  const players = useJlFavoritePlayers();
  const favorites = useMemo(() => effectiveTeams(teams, players), [teams, players]);
  const games = useJlGames(favorites);
  const index = useSportsChannelIndex(channels, epg, nowMs);

  const [filter, setFilter] = useState<GuideGamesFilter>(() =>
    defaultGuideFilter(prefs, new Date(nowMs)),
  );
  const [choosing, setChoosing] = useState<Row | null>(null);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), FIRST_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const { rows, next } = useMemo(() => {
    const now = new Date(nowMs);
    const cache = new Map<string, GameChannel[]>();
    const channelsOf = (g: SportsGame) => {
      const key = `${g.league}:${g.id}`;
      let found = cache.get(key);
      if (!found) {
        found = channelsForGame(g, index, now);
        cache.set(key, found);
      }
      return found;
    };
    return {
      rows: selectGuideGames(games, favorites, { now, prefs, channelsOf }),
      next: (f: GuideGamesFilter) => nextGuideGame(games, f, { now, channelsOf }),
    };
  }, [games, favorites, index, nowMs, prefs]);

  const leagues = useMemo(
    () => guideFilterLeagues(rows, prefs, new Date(nowMs), filter),
    [rows, prefs, nowMs, filter],
  );
  const shown = useMemo(
    () => rows.filter((r) => matchesGuideFilter(r.game.league, filter)),
    [rows, filter],
  );

  const chips: Array<{ id: GuideGamesFilter; label: string }> = [
    { id: "all", label: t("All") },
    { id: "football", label: t("Football") },
    ...leagues.map((l) => ({ id: l, label: t(LEAGUE_LABELS.get(l) ?? l) })),
  ];
  const countOf = (id: GuideGamesFilter) =>
    rows.filter((r) => matchesGuideFilter(r.game.league, id)).length;

  const loading = games.length === 0 && !waited;
  const nextGame = shown.length === 0 && !loading ? next(filter) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-4 pb-10">
      <div
        className="flex shrink-0 flex-wrap gap-1.5 pb-3"
        role="group"
        aria-label={t("Filter games by league")}
      >
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={filter === c.id}
            onClick={() => setFilter(c.id)}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
              filter === c.id
                ? "border-ink bg-ink text-canvas"
                : "border-edge-soft text-ink-muted hover:border-edge hover:text-ink"
            }`}
          >
            {c.label}
            <span className={filter === c.id ? "text-canvas/70" : "text-ink-subtle"}>
              {countOf(c.id)}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[13px] text-ink-subtle">
          <Loader2 size={14} className="animate-spin" />
          {t("Finding games on your channels…")}
        </div>
      ) : shown.length > 0 ? (
        <div className="flex flex-col gap-2">
          {shown.map((row) => (
            <GameRow
              key={`${row.game.league}:${row.game.id}`}
              row={row}
              nowMs={nowMs}
              onPlay={() => watchGameOn(row.channels[0].channel, row.game, onPlay)}
              onMore={() => setChoosing(row)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 py-6 text-[13px] text-ink-muted">
          <p>
            {!settings.sportsChannelFinder
              ? t(
                  "Turn on Smart Channel Finder in Settings → Sports to match games to your channels.",
                )
              : filter === "all"
                ? t("No games on your channels right now.")
                : t("No {league} games on your channels right now.", {
                    league: chips.find((c) => c.id === filter)?.label ?? filter,
                  })}
          </p>
          {nextGame && (
            <p className="text-ink-subtle">
              {t("Next up: {game}, {time}", {
                game: matchup(nextGame, t),
                time: startLabel(nextGame.startMs, nowMs, t),
              })}
            </p>
          )}
          {filter !== "all" && rows.length > 0 && (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="mt-1 flex h-8 items-center rounded-full border border-edge-soft px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:border-edge hover:text-ink"
            >
              {t("Show all games ({n})", { n: rows.length })}
            </button>
          )}
        </div>
      )}

      {choosing && (
        <WatchChooser
          item={{ ...choosing, score: 0, reasons: [] }}
          onPlay={onPlay}
          onOpenGame={openMatchDetail}
          onClose={() => setChoosing(null)}
        />
      )}
    </div>
  );
}

function GameRow({
  row,
  nowMs,
  onPlay,
  onMore,
}: {
  row: Row;
  nowMs: number;
  onPlay: () => void;
  onMore: () => void;
}) {
  const t = useT();
  const { game, mine, channels } = row;
  const best = channels[0].channel;
  const live = game.state === "in";
  const more = channels.length - 1;
  const title = matchup(game, t);
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={onPlay}
        aria-label={t("Watch {game} on {channel}", { game: title, channel: best.name })}
        className={`flex min-w-0 flex-1 items-center gap-4 rounded-xl border px-4 py-3 text-start transition-colors hover:bg-raised ${
          mine ? "border-accent/40 bg-elevated" : "border-edge-soft/60 bg-elevated"
        }`}
      >
        <span
          className={`flex w-[92px] shrink-0 flex-col gap-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
            live ? "text-danger" : "text-ink-subtle"
          }`}
        >
          <span className="flex items-center gap-1.5">
            {live && (
              <span className="h-1.5 w-1.5 rounded-full bg-danger motion-safe:animate-pulse" />
            )}
            {live ? t("Live") : startLabel(game.startMs, nowMs, t)}
          </span>
          {live && game.detail && (
            <span className="truncate text-[10.5px] font-semibold normal-case tracking-normal text-ink-muted">
              {game.detail}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {[game.away, game.home].map((side, i) => (
            <span key={i} className="flex min-w-0 items-center gap-2">
              {side.logo ? (
                <img
                  src={side.logo}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                  className="h-5 w-5 shrink-0 object-contain"
                />
              ) : (
                <span className="h-5 w-5 shrink-0" />
              )}
              {side.rank ? (
                <span className="text-[11px] font-bold text-accent">#{side.rank}</span>
              ) : null}
              <span dir="auto" className="truncate text-[14px] font-semibold text-ink">
                {tickerTeamName(side, game.league)}
              </span>
              {visibleScore(game, side) && (
                <span className="ms-auto shrink-0 text-[14px] font-bold tabular-nums text-ink">
                  {visibleScore(game, side)}
                </span>
              )}
            </span>
          ))}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {mine && <Star size={12} fill="currentColor" strokeWidth={0} className="text-accent" />}
          <span className="rounded-md bg-canvas/60 px-1.5 py-0.5 text-[10.5px] font-bold tracking-[0.06em] text-ink-muted ring-1 ring-inset ring-edge-soft">
            {game.league}
          </span>
        </span>
        <span className="flex w-[200px] shrink-0 items-center gap-2.5 border-s border-edge-soft/60 ps-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-canvas ring-1 ring-inset ring-edge-soft">
            {best.logo ? (
              <img
                src={best.logo}
                alt=""
                draggable={false}
                loading="lazy"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <Tv size={16} strokeWidth={1.7} className="text-ink-subtle" />
            )}
          </span>
          <span dir="auto" className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">
            {best.name}
          </span>
          {qualityLabel(best.name) && (
            <span className="shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
              {qualityLabel(best.name)}
            </span>
          )}
          <Play size={13} fill="currentColor" strokeWidth={0} className="shrink-0 text-accent" />
        </span>
      </button>
      {more > 0 && (
        <button
          type="button"
          onClick={onMore}
          aria-label={t("{n} more channels for {game}", { n: more, game: title })}
          className="flex w-[72px] shrink-0 items-center justify-center rounded-xl border border-edge-soft/60 bg-elevated text-[12px] font-semibold text-ink-muted transition-colors hover:bg-raised hover:text-ink"
        >
          {t("+{n} more", { n: more })}
        </button>
      )}
    </div>
  );
}
