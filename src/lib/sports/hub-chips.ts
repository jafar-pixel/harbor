import type { SportsGame } from "./espn-types";

/** A league as the Hub chips need it: its key, the tag its games carry, and its sport group. */
export type ChipLeague = { key: string; tag: string; group: string };

/** One chip in the Hub's sports row: a single league, or Esports (every esports title). */
export type HubChip = { key: string; tags: string[]; league: ChipLeague | null };

/** Shown on the Hub even when Personalize leaves them out. */
export const ALWAYS_ON_LEAGUES = ["F1", "UFC"];
export const ESPORTS_CHIP = "esports";

const DAY_MS = 86_400_000;

/**
 * The Hub's sports row: the leagues picked in Personalize, in that order, then Formula 1, MMA
 * (UFC) and Esports. Esports is one chip for every esports title.
 */
export function hubChips(selected: string[], leagues: ChipLeague[]): HubChip[] {
  const byKey = new Map(leagues.map((l) => [l.key, l] as const));
  const out: HubChip[] = [];
  const seen = new Set<string>();
  for (const key of [...selected, ...ALWAYS_ON_LEAGUES]) {
    const league = byKey.get(key);
    if (!league || league.group === "esports" || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, tags: [league.tag], league });
  }
  const esports = leagues.filter((l) => l.group === "esports").map((l) => l.tag);
  if (esports.length) out.push({ key: ESPORTS_CHIP, tags: esports, league: null });
  return out;
}

/** Every league the Hub feed has to load for its chips. */
export function hubFeedLeagues(chips: HubChip[], leagues: ChipLeague[]): string[] {
  const tags = new Set(chips.flatMap((c) => c.tags));
  return leagues.filter((l) => tags.has(l.tag)).map((l) => l.key);
}

/** Only the chosen chip's games; "all" keeps every chip's games and nothing else. */
export function gamesForChip(games: SportsGame[], chips: HubChip[], chip: string): SportsGame[] {
  const pool = chip === "all" ? chips : chips.filter((c) => c.key === chip);
  const tags = new Set(pool.flatMap((c) => c.tags));
  return games.filter((g) => tags.has(g.league));
}

function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Live Today: games on now, then today's games by start time, then today's results. */
export function liveTodayGames(games: SportsGame[], now: number): SportsGame[] {
  const from = startOfLocalDay(now);
  const to = from + DAY_MS;
  const rank = { in: 0, pre: 1, post: 2 } as const;
  return games
    .filter((g) => g.state === "in" || (g.startMs >= from && g.startMs < to))
    .sort((a, b) => rank[a.state] - rank[b.state] || a.startMs - b.startMs);
}

/** Next 7 days: games that haven't finished and start before a week from now, soonest first. */
export function nextSevenDays(games: SportsGame[], now: number): SportsGame[] {
  return games
    .filter(
      (g) =>
        g.state !== "post" && g.startMs < now + 7 * DAY_MS && g.startMs >= startOfLocalDay(now),
    )
    .sort((a, b) => a.startMs - b.startMs);
}
