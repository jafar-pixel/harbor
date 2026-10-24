import type { SportsGame } from "../espn-types.ts";
import type { StandingsTable } from "../standings.ts";
import {
  ordered,
  participants,
  type EntrantKey,
  type Tournament,
  type TournamentKind,
  type Winners,
} from "./engine.ts";
import type { FieldTeam } from "./pools.ts";

/** The scoreboard league each format's games are listed under. */
export const BRACKET_LEAGUE: Record<TournamentKind, string> = {
  cfp: "NCAAF",
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  ncaam: "NCAA",
  ncaaw: "NCAAW",
};

/**
 * The scoreboard query for a tournament's games: its postseason dates (season = the year of the
 * title game, so a 2027 CFP runs December 2026 into January 2027) and postseason only.
 */
export function postseasonQuery(kind: TournamentKind, season: number): string {
  const span: Record<TournamentKind, [string, string]> = {
    cfp: [`${season - 1}1210`, `${season}0131`],
    nfl: [`${season}0101`, `${season}0220`],
    nba: [`${season}0410`, `${season}0630`],
    mlb: [`${season}0925`, `${season}1110`],
    ncaam: [`${season}0310`, `${season}0415`],
    ncaaw: [`${season}0310`, `${season}0415`],
  };
  const [from, to] = span[kind];
  return `${from}-${to}&seasontype=3&limit=500`;
}

/** Wins that decide a matchup, by format and round (NBA and MLB rounds are series). */
export function winsNeeded(kind: TournamentKind, round: number): number {
  if (kind === "nba") return 4;
  if (kind === "mlb") return round === 1 ? 2 : round === 2 ? 3 : 4;
  return 1;
}

/**
 * Real results from finished postseason games: a matchup is decided once one of its two teams
 * has won enough games against the other. Rounds resolve in order, so a later game is only
 * matched once the teams in it are known.
 */
export function resultsFromGames(
  t: Tournament,
  field: Record<EntrantKey, FieldTeam>,
  games: SportsGame[],
): Winners {
  const league = BRACKET_LEAGUE[t.kind];
  const finals = games.filter(
    (g) => g.league === league && g.state === "post" && g.postseason !== false,
  );
  const results: Winners = {};
  for (const m of ordered(t)) {
    const [a, b] = participants(t, m.id, results);
    if (!a || !b) continue;
    const ta = field[a]?.teamId;
    const tb = field[b]?.teamId;
    if (!ta || !tb) continue;
    let winsA = 0,
      winsB = 0;
    for (const g of finals) {
      const ids = [g.home.id, g.away.id];
      if (!ids.includes(ta) || !ids.includes(tb)) continue;
      const winner = g.home.winner ? g.home.id : g.away.winner ? g.away.id : null;
      if (winner === ta) winsA += 1;
      else if (winner === tb) winsB += 1;
    }
    const need = winsNeeded(t.kind, m.round);
    if (winsA >= need) results[m.id] = a;
    else if (winsB >= need) results[m.id] = b;
  }
  return results;
}

/** Total points in the final game, for the tiebreaker, once it's over. */
export function finalTotal(
  t: Tournament,
  field: Record<EntrantKey, FieldTeam>,
  games: SportsGame[],
  results: Winners,
): number | null {
  const all = ordered(t);
  const last = all[all.length - 1];
  if (!last || !results[last.id]) return null;
  const [a, b] = participants(t, last.id, results);
  const ids = [a, b].map((k) => (k ? field[k]?.teamId : undefined));
  const game = games
    .filter((g) => g.state === "post" && ids.includes(g.home.id) && ids.includes(g.away.id))
    .sort((x, y) => y.startMs - x.startMs)[0];
  if (!game) return null;
  const total = Number(game.home.score) + Number(game.away.score);
  return Number.isFinite(total) ? total : null;
}

/** Standings group names for each bracket region. */
const REGION_GROUPS: Record<string, RegExp> = {
  AFC: /\b(afc|american football conference)\b/i,
  NFC: /\b(nfc|national football conference)\b/i,
  East: /\beast(ern)?\b/i,
  West: /\bwest(ern)?\b/i,
  AL: /\b(al|american league)\b/i,
  NL: /\b(nl|national league)\b/i,
};

/**
 * A field from league standings, by published playoff seed: NFL, NBA and MLB only (the CFP and
 * March Madness fields are set by committees, so their pool owners fill them in). Seeds the
 * standings don't list stay empty for the owner.
 */
export function fieldFromStandings(
  t: Tournament,
  table: StandingsTable,
  league: string,
): Record<EntrantKey, FieldTeam> {
  const field: Record<EntrantKey, FieldTeam> = {};
  if (!["nfl", "nba", "mlb"].includes(t.kind)) return field;
  for (const region of t.regions) {
    const match = REGION_GROUPS[region];
    const group = match && table.groups.find((g) => match.test(g.name));
    if (!group) continue;
    const size = t.entrants.filter((k) => k.startsWith(`${region}:`)).length;
    const bySeed = [...group.rows].sort((x, y) => x.rank - y.rank).slice(0, size);
    bySeed.forEach((row, i) => {
      field[`${region}:${i + 1}`] = {
        teamId: row.teamId,
        league,
        name: row.name,
        abbr: row.abbr,
        logo: row.logo,
      };
    });
  }
  return field;
}
