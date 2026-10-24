import type { SportsGame } from "../sports/espn.ts";

/**
 * Big sports events, read from the day's scoreboards rather than fixed dates: a plug-in shows
 * only while ESPN lists its event (the World Series games, Super Bowl Sunday, bowl season...),
 * so the calendar comes from the leagues themselves. Plain module so the rules are tested.
 */
export const SPORTS_EVENT_IDS = [
  "world-series",
  "super-bowl",
  "college-playoff",
  "bowl-season",
  "college-game-of-week",
  "nfl-game-of-week",
  "nba-all-star",
  "nba-finals",
  "final-four",
] as const;
export type SportsEventId = (typeof SPORTS_EVENT_IDS)[number];

/** The leagues whose scoreboards carry these events, fetched whether or not the viewer follows them. */
export const SPORTS_EVENT_LEAGUES = ["NFL", "NCAAF", "NBA", "MLB", "NCAAB", "NCAAW"] as const;

export type SportsEvent = {
  id: SportsEventId;
  /** The game the card opens: the live one, else the next, else the last. */
  game: SportsGame;
  /** Every listed game of the event today (bowl season can have several). */
  games: SportsGame[];
};

const text = (g: SportsGame) =>
  [g.headline, g.context?.name, g.context?.round, g.detail].filter(Boolean).join(" ");

const RULES: Array<{ id: SportsEventId; match: (g: SportsGame) => boolean }> = [
  { id: "world-series", match: (g) => g.league === "MLB" && /\bworld series\b/i.test(text(g)) },
  { id: "super-bowl", match: (g) => g.league === "NFL" && /\bsuper bowl\b/i.test(text(g)) },
  {
    id: "college-playoff",
    match: (g) =>
      g.league === "NCAAF" &&
      /\b(college football playoff|cfp|national championship)\b/i.test(text(g)),
  },
  {
    id: "bowl-season",
    match: (g) =>
      g.league === "NCAAF" &&
      /\bbowl\b/i.test(text(g)) &&
      !/\b(college football playoff|cfp|national championship)\b/i.test(text(g)),
  },
  { id: "nba-all-star", match: (g) => g.league === "NBA" && /\ball[- ]star\b/i.test(text(g)) },
  { id: "nba-finals", match: (g) => g.league === "NBA" && /\bnba finals\b/i.test(text(g)) },
  {
    id: "final-four",
    match: (g) =>
      (g.league === "NCAA" || g.league === "NCAAW") &&
      /\b(final four|national championship)\b/i.test(text(g)),
  },
];

/** Live first, then the next kick-off, then the most recent final. */
function lead(games: SportsGame[], now: number): SportsGame {
  const live = games.find((g) => g.state === "in");
  if (live) return live;
  const next = games
    .filter((g) => g.state === "pre" && g.startMs >= now - 3 * 3600000)
    .sort((a, b) => a.startMs - b.startMs)[0];
  return next ?? [...games].sort((a, b) => b.startMs - a.startMs)[0];
}

const winPct = (record: string | undefined) => {
  const [w, l] = (record ?? "").split("-").map(Number);
  return Number.isFinite(w) && Number.isFinite(l) && w + l > 0 ? w / (w + l) : 0;
};

/**
 * The day's marquee regular-season game: in college the best pair of AP rankings (both teams
 * ranked beats one), in the NFL the best combined record. Needs a ranked team (college) or a
 * winning pair (NFL) so a quiet day has no "game of the week".
 */
function gameOfWeek(games: SportsGame[], league: "NCAAF" | "NFL"): SportsGame | null {
  const regular = games.filter((g) => g.league === league && g.postseason !== true);
  if (league === "NCAAF") {
    const score = (g: SportsGame) => {
      const ranks = [g.home.rank, g.away.rank].filter((r): r is number => !!r && r <= 25);
      return ranks.length === 0 ? 0 : ranks.length * 100 - ranks.reduce((a, b) => a + b, 0);
    };
    const best = regular.filter((g) => score(g) > 0).sort((a, b) => score(b) - score(a))[0];
    return best ?? null;
  }
  const score = (g: SportsGame) => winPct(g.home.record) + winPct(g.away.record);
  const best = regular.filter((g) => score(g) >= 1).sort((a, b) => score(b) - score(a))[0];
  return best ?? null;
}

/** Today's events, in SPORTS_EVENT_IDS order. College and NFL game of the week only on their main days. */
export function detectSportsEvents(games: SportsGame[], now: Date): SportsEvent[] {
  const out: SportsEvent[] = [];
  const at = now.getTime();
  for (const id of SPORTS_EVENT_IDS) {
    if (id === "college-game-of-week" || id === "nfl-game-of-week") {
      const day = now.getDay();
      const league = id === "college-game-of-week" ? "NCAAF" : "NFL";
      // Saturday is college football's day; Sunday the NFL's.
      if ((league === "NCAAF" && day !== 6) || (league === "NFL" && day !== 0)) continue;
      const game = gameOfWeek(games, league);
      if (game) out.push({ id, game, games: [game] });
      continue;
    }
    const rule = RULES.find((r) => r.id === id)!;
    const matched = games.filter(rule.match);
    if (matched.length) out.push({ id, game: lead(matched, at), games: matched });
  }
  return out;
}
