import {
  cleanPicks,
  ordered,
  participants,
  seedOf,
  type EntrantKey,
  type Tournament,
  type Winners,
} from "./engine.ts";

/**
 * Auto-fill strategies for a bracket, after Kyle Stahl's bracketology simulators
 * (github.com/kylestahl/bracketology, MIT): each game is decided by a rule on the two teams.
 *
 *   favorites  the better seed wins
 *   stats      the better season record wins (win percentage), seed breaking ties
 *   upsets     a weighted coin: the better seed is favoured, an underdog can still win
 */
export type AutoFillStrategy = "favorites" | "stats" | "upsets";

/** A small seeded random number generator (mulberry32), so a fill can be repeated in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function better(a: EntrantKey, b: EntrantKey): EntrantKey {
  return seedOf(b) < seedOf(a) ? b : a;
}

/**
 * Fills every open game of a bracket, keeping picks already made. `ratings` maps an entrant to
 * its season win percentage (0..1) for the stats strategy.
 */
export function autoFill(
  t: Tournament,
  existing: Winners,
  strategy: AutoFillStrategy,
  opts: { ratings?: Record<EntrantKey, number>; random?: () => number } = {},
): Winners {
  const random = opts.random ?? Math.random;
  const picks: Winners = { ...cleanPicks(t, existing) };
  for (const m of ordered(t)) {
    if (picks[m.id]) continue;
    const [a, b] = participants(t, m.id, picks);
    if (!a || !b) continue;
    let winner: EntrantKey;
    if (strategy === "favorites") {
      winner = better(a, b);
    } else if (strategy === "stats") {
      const ra = opts.ratings?.[a];
      const rb = opts.ratings?.[b];
      winner = ra != null && rb != null && ra !== rb ? (ra > rb ? a : b) : better(a, b);
    } else {
      // The chance the better seed wins grows with the seed gap: 1 v 16 about 94%, 8 v 9 about 53%.
      const fav = better(a, b);
      const dog = fav === a ? b : a;
      const gap = Math.max(0, seedOf(dog) - seedOf(fav));
      const pFav = 0.5 + Math.min(0.45, gap * 0.03);
      winner = random() < pFav ? fav : dog;
    }
    picks[m.id] = winner;
  }
  return picks;
}

/** How the pool picked each game: matchup id → entrant → share of entries (0..1). */
export function pickShares(
  t: Tournament,
  entries: Winners[],
): Record<string, Record<EntrantKey, number>> {
  const out: Record<string, Record<EntrantKey, number>> = {};
  if (!entries.length) return out;
  for (const m of t.matchups) {
    const counts: Record<EntrantKey, number> = {};
    let n = 0;
    for (const e of entries) {
      const p = e[m.id];
      if (!p) continue;
      counts[p] = (counts[p] ?? 0) + 1;
      n++;
    }
    if (!n) continue;
    out[m.id] = Object.fromEntries(Object.entries(counts).map(([k, c]) => [k, c / n]));
  }
  return out;
}
