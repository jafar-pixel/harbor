import type { SportsGame, SportsSide } from "../../sports/espn-types.ts";
import { isFavoriteGame, type JlFavoriteTeam } from "./rank.ts";

/** Tickarr, the score ticker across the top of the hubs: today's games. */
export const TICKER_LIMIT = 40;

const COLLEGE = new Set(["NCAAF", "NCAAB"]);
const PRO_NICKNAMES = new Set(["NFL", "NBA", "NHL", "MLB"]);

function sameLocalDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export type TickerGame = { game: SportsGame; mine: boolean };

/**
 * Today's games across JL's leagues: everything live, plus today's kick-offs and finals. Your
 * teams lead, then live games, then the rest by start time.
 */
export function selectTickerGames(
  games: SportsGame[],
  favorites: JlFavoriteTeam[],
  now: number,
  limit = TICKER_LIMIT,
): TickerGame[] {
  const seen = new Set<string>();
  const picked: TickerGame[] = [];
  for (const game of games) {
    const key = `${game.league}:${game.id}`;
    if (seen.has(key)) continue;
    if (game.state !== "in" && !(game.startMs && sameLocalDay(game.startMs, now))) continue;
    seen.add(key);
    picked.push({ game, mine: isFavoriteGame(game, favorites) });
  }
  return picked
    .sort(
      (a, b) =>
        Number(b.mine) - Number(a.mine) ||
        Number(b.game.state === "in") - Number(a.game.state === "in") ||
        a.game.startMs - b.game.startMs,
    )
    .slice(0, limit);
}

export type TickerStatus =
  | { kind: "live"; detail: string }
  | { kind: "final"; detail: string }
  | { kind: "time"; startMs: number };

/** Live with the clock or period, the final, or the kick-off time (formatted by the caller). */
export function tickerStatus(game: SportsGame): TickerStatus {
  if (game.state === "in") return { kind: "live", detail: game.detail };
  if (game.state === "post") return { kind: "final", detail: game.detail };
  return { kind: "time", startMs: game.startMs };
}

/** The short name a crawl has room for: "Ohio State", "Chiefs", "Arsenal". */
export function tickerTeamName(side: SportsSide, league: string): string {
  if (COLLEGE.has(league)) return side.location || side.name;
  if (PRO_NICKNAMES.has(league)) return side.nickname || side.abbr || side.name;
  return side.name || side.abbr;
}

/** What an upcoming game adds after the teams: its network, and the line when odds are allowed. */
export function tickerExtras(game: SportsGame, showOdds: boolean): string[] {
  if (game.state !== "pre") return [];
  const extras: string[] = [];
  if (game.network) extras.push(game.network);
  if (showOdds && game.odds) extras.push(game.odds);
  return extras;
}
