import type { TournamentKind } from "@/lib/sports/brackets/engine";

export const BRACKET_KINDS: TournamentKind[] = ["cfp", "nfl", "nba", "mlb", "ncaam", "ncaaw"];

export const BRACKET_TITLES: Record<TournamentKind, string> = {
  cfp: "College Football Playoff",
  nfl: "NFL Playoffs",
  nba: "NBA Playoffs",
  mlb: "MLB Postseason",
  ncaam: "Men's March Madness",
  ncaaw: "Women's March Madness",
};

/** Month (0-based) after which a format's next title game falls in the following year. */
const SEASON_ROLLOVER: Record<TournamentKind, number> = {
  cfp: 6,
  nfl: 6,
  nba: 5,
  mlb: 10,
  ncaam: 3,
  ncaaw: 3,
};

/** The upcoming tournament's season: the year its title game is played. */
export function upcomingSeason(kind: TournamentKind, now = new Date()): number {
  return now.getMonth() > SEASON_ROLLOVER[kind] ? now.getFullYear() + 1 : now.getFullYear();
}
