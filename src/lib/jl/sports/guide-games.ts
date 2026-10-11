import type { SportsGame } from "../../sports/espn-types.ts";
import { rankGames, type JlFavoriteTeam } from "./rank.ts";
import { leaguesForToday, weekdayOf, type SportPrefs } from "./sport-priorities.ts";

/**
 * The Live TV Guide's "Games" view: the games on the viewer's own channels that are live now or
 * start soon, one row per game, plus the league filter above them. Plain module, no I/O.
 */

export const GUIDE_GAMES_AHEAD_MS = 4 * 3600000;
// A game still marked upcoming this long after its listed start is a stale listing, not a delay.
const STALE_PRE_MS = 3 * 3600000;
const FOOTBALL = new Set(["NFL", "NCAAF"]);

/** "all", "football" (NFL and college together) or one league tag ("NBA"). */
export type GuideGamesFilter = string;

export type GuideGame<C> = { game: SportsGame; mine: boolean; channels: C[] };

type Options<C> = {
  now: Date;
  prefs: SportPrefs;
  /** The viewer's channels carrying a game, best first. */
  channelsOf: (game: SportsGame) => C[];
};

const keyOf = (g: SportsGame) => `${g.league}:${g.id}`;

function inWindow(game: SportsGame, nowMs: number): boolean {
  if (game.state === "in") return true;
  if (game.state !== "pre" || game.dateOnly) return false;
  return game.startMs <= nowMs + GUIDE_GAMES_AHEAD_MS && game.startMs > nowMs - STALE_PRE_MS;
}

function leagueRanker(prefs: SportPrefs, now: Date): (league: string) => number {
  const order = leaguesForToday(prefs, now);
  return (league) => {
    const i = order.indexOf(league);
    return i < 0 ? order.length : i;
  };
}

/**
 * Live and soon-starting games that one of the viewer's channels carries, each once: your teams
 * first, then live before upcoming, then today's sport order (game-day focus first), with the
 * Sports Hub's ranking breaking ties. Sports switched off in "My sports" only show for your teams.
 */
export function selectGuideGames<C>(
  games: SportsGame[],
  favorites: JlFavoriteTeam[],
  { now, prefs, channelsOf }: Options<C>,
): GuideGame<C>[] {
  const nowMs = now.getTime();
  const rankOf = leagueRanker(prefs, now);
  const seen = new Set<string>();
  const out: GuideGame<C>[] = [];
  for (const r of rankGames(
    games.filter((g) => inWindow(g, nowMs)),
    favorites,
    { now, prefs },
  )) {
    const key = keyOf(r.game);
    if (seen.has(key)) continue;
    seen.add(key);
    const channels = channelsOf(r.game);
    if (channels.length > 0) out.push({ game: r.game, mine: r.mine, channels });
  }
  // Array sort is stable, so the ranking order survives within each group.
  return out.sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      Number(b.game.state === "in") - Number(a.game.state === "in") ||
      rankOf(a.game.league) - rankOf(b.game.league),
  );
}

export function matchesGuideFilter(league: string, filter: GuideGamesFilter): boolean {
  if (filter === "all") return true;
  if (filter === "football") return FOOTBALL.has(league);
  return league === filter;
}

/** The leagues to offer as filters, in today's sport order; a selected league stays listed. */
export function guideFilterLeagues(
  rows: ReadonlyArray<{ game: SportsGame }>,
  prefs: SportPrefs,
  now: Date,
  selected?: GuideGamesFilter,
): string[] {
  const leagues = new Set(rows.map((r) => r.game.league));
  if (selected && selected !== "all" && selected !== "football") leagues.add(selected);
  const rankOf = leagueRanker(prefs, now);
  return [...leagues].sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
}

/** Football on a football focus day (by default Thursday, Saturday, Sunday and Monday), else all. */
export function defaultGuideFilter(prefs: SportPrefs, now: Date): GuideGamesFilter {
  const focus = prefs.dayFocus[weekdayOf(now)] ?? [];
  return focus.some((l) => FOOTBALL.has(l)) ? "football" : "all";
}

/** The next game on the viewer's channels after the guide's window, for the empty state. */
export function nextGuideGame<C>(
  games: SportsGame[],
  filter: GuideGamesFilter,
  { now, channelsOf }: Pick<Options<C>, "now" | "channelsOf">,
): SportsGame | null {
  const after = now.getTime() + GUIDE_GAMES_AHEAD_MS;
  let next: SportsGame | null = null;
  for (const g of games) {
    if (g.state !== "pre" || g.dateOnly || g.startMs <= after) continue;
    if (!matchesGuideFilter(g.league, filter)) continue;
    if (next && g.startMs >= next.startMs) continue;
    if (channelsOf(g).length > 0) next = g;
  }
  return next;
}
