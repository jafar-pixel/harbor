import type { SportCategory } from "./sports-channels.ts";

/** The leagues providers group their sports channels by, in the order the Sports TV lists them. */
export type TvLeague =
  | "NFL"
  | "NCAAF"
  | "NBA"
  | "WNBA"
  | "NCAAB"
  | "MLB"
  | "NHL"
  | "Soccer"
  | "Fights"
  | "Racing"
  | "Golf & Tennis"
  | "More sports";

export const TV_LEAGUES: TvLeague[] = [
  "NFL",
  "NCAAF",
  "NBA",
  "WNBA",
  "NCAAB",
  "MLB",
  "NHL",
  "Soccer",
  "Fights",
  "Racing",
  "Golf & Tennis",
  "More sports",
];

export const TV_LEAGUE_LABELS: Record<TvLeague, string> = {
  NFL: "NFL",
  NCAAF: "College Football",
  NBA: "NBA",
  WNBA: "WNBA",
  NCAAB: "College Basketball",
  MLB: "MLB",
  NHL: "NHL",
  Soccer: "Soccer",
  Fights: "Fights",
  Racing: "Racing",
  "Golf & Tennis": "Golf & Tennis",
  "More sports": "More sports",
};

// Checked in order: the college and women's leagues before the pro leagues they contain.
const RULES: [TvLeague, RegExp][] = [
  ["NCAAF", /\b(NCAAF|CFB|COLLEGE FOOTBALL|NCAA FOOTBALL)\b/i],
  ["NCAAB", /\b(NCAAB|CBB|COLLEGE BASKETBALL|NCAA BASKETBALL|MARCH MADNESS)\b/i],
  ["WNBA", /\bWNBA\b/i],
  ["NBA", /\bNBA\b/i],
  ["NFL", /\b(NFL|SUNDAY TICKET|RED ?ZONE)\b/i],
  ["MLB", /\b(MLB|MILB)\b/i],
  ["NHL", /\bNHL\b/i],
  [
    "Soccer",
    /\b(SOCCER|MLS|NWSL|PREMIER LEAGUE|EPL|LA ?LIGA|SERIE A|BUNDESLIGA|LIGUE 1|LIGA MX|UEFA|CHAMPIONS LEAGUE|FIFA|CONCACAF|COPA)\b/i,
  ],
];

const BY_SPORT: Partial<Record<SportCategory, TvLeague>> = {
  soccer: "Soccer",
  combat: "Fights",
  racing: "Racing",
  "golf-tennis": "Golf & Tennis",
};

/**
 * The league a sports channel belongs to, read from its provider group first ("USA NCAAF",
 * "US| NBA PASS PPV", "USA NFL - Sunday Ticket"), then its name and the game in it.
 */
export function tvLeagueOf(
  text: { group: string | null; name: string; title: string },
  sport: SportCategory,
): TvLeague {
  for (const part of [text.group ?? "", text.name, text.title]) {
    for (const [league, re] of RULES) if (re.test(part)) return league;
  }
  return BY_SPORT[sport] ?? "More sports";
}
