import type { SportsGame } from "./espn-types";

/** A league as the Hub chips need it: its key, the tag its games carry, and its sport group. */
export type ChipLeague = { key: string; tag: string; group: string };

/** One chip in the Hub's sports row: a single league, or Esports (every esports title). */
export type HubChip = { key: string; tags: string[]; league: ChipLeague | null };

export const ESPORTS_CHIP = "esports";

const DAY_MS = 86_400_000;

/**
 * The Hub's sports row: only the leagues picked in Personalize, in that order. Picked esports
 * titles share one Esports chip at the end.
 */
export function hubChips(selected: string[], leagues: ChipLeague[]): HubChip[] {
  const byKey = new Map(leagues.map((l) => [l.key, l] as const));
  const out: HubChip[] = [];
  const seen = new Set<string>();
  for (const key of selected) {
    const league = byKey.get(key);
    if (!league || league.group === "esports" || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, tags: [league.tag], league });
  }
  const esports = leagues
    .filter((l) => l.group === "esports" && selected.includes(l.key))
    .map((l) => l.tag);
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

/** College leagues, where Live Today lists the Top 25 games. */
const COLLEGE = /^(NCAA|CFB|CBB)/i;

/**
 * Live Today for a college league: games with a Top 25 team, best-ranked first. Every game when
 * none is ranked, or for any other league.
 */
export function topRankedGames(games: SportsGame[], league: string | null): SportsGame[] {
  if (!league || !COLLEGE.test(league)) return games;
  const best = (g: SportsGame) => Math.min(g.home.rank ?? 99, g.away.rank ?? 99);
  const ranked = games.filter((g) => best(g) <= 25);
  if (!ranked.length) return games;
  const live = { in: 0, pre: 1, post: 2 } as const;
  return ranked.sort((a, b) => live[a.state] - live[b.state] || best(a) - best(b));
}
