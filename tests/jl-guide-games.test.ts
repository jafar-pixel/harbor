// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  defaultGuideFilter,
  guideFilterLeagues,
  matchesGuideFilter,
  nextGuideGame,
  selectGuideGames,
} from "../src/lib/jl/sports/guide-games.ts";
import { DEFAULT_DAY_FOCUS } from "../src/lib/jl/sports/sport-priorities.ts";
import type { SportsGame } from "../src/lib/sports/espn-types.ts";

const SATURDAY = new Date(2026, 9, 10, 12); // Sat 10 Oct 2026, local time
const TUESDAY = new Date(2026, 9, 13, 12);
const HOUR = 3600_000;
const prefs = { priority: ["NCAAF", "NFL", "NBA", "NHL"], dayFocus: DEFAULT_DAY_FOCUS };

const game = (id: string, league: string, over: Partial<SportsGame> = {}): SportsGame => ({
  id,
  league,
  state: "pre",
  detail: "",
  startMs: SATURDAY.getTime() + HOUR,
  home: { id: `${id}h`, name: `${id} Home`, abbr: "H", logo: "", score: "", winner: false },
  away: { id: `${id}a`, name: `${id} Away`, abbr: "A", logo: "", score: "", winner: false },
  ...over,
});

const onAll = (g: SportsGame) => [`ch-${g.id}`];
const ids = (rows: Array<{ game: SportsGame }>) => rows.map((r) => r.game.id);

test("only live and soon-starting games on your channels, each once", () => {
  const games = [
    game("live", "NFL", { state: "in" }),
    game("soon", "NFL"),
    game("later", "NFL", { startMs: SATURDAY.getTime() + 5 * HOUR }),
    game("final", "NFL", { state: "post" }),
    game("stale", "NFL", { startMs: SATURDAY.getTime() - 4 * HOUR }),
    game("dateonly", "NFL", { dateOnly: "2026-10-10" }),
    game("nochannel", "NFL"),
    game("soon", "NFL"),
  ];
  const rows = selectGuideGames(games, [], {
    now: SATURDAY,
    prefs,
    channelsOf: (g) => (g.id === "nochannel" ? [] : onAll(g)),
  });
  assert.deepEqual(ids(rows), ["live", "soon"]);
  assert.deepEqual(rows[0].channels, ["ch-live"]);
});

test("your teams first, then live, then today's sport order", () => {
  const games = [
    game("nba-live", "NBA", { state: "in" }),
    game("nfl-soon", "NFL"),
    game("cfb-soon", "NCAAF"),
    game("nfl-live", "NFL", { state: "in" }),
    game("mine", "NHL", { startMs: SATURDAY.getTime() + 3 * HOUR }),
  ];
  const favorites = [{ league: "NHL", id: "mineh", name: "mine Home" }];
  const rows = selectGuideGames(games, favorites, { now: SATURDAY, prefs, channelsOf: onAll });
  assert.deepEqual(ids(rows), ["mine", "nfl-live", "nba-live", "cfb-soon", "nfl-soon"]);
  assert.equal(rows[0].mine, true);
});

test("switched-off sports only show for your teams", () => {
  const games = [game("mlb", "MLB"), game("mlb-mine", "MLB")];
  const favorites = [{ league: "MLB", id: "mlb-mineh", name: "x" }];
  const rows = selectGuideGames(games, favorites, { now: SATURDAY, prefs, channelsOf: onAll });
  assert.deepEqual(ids(rows), ["mlb-mine"]);
});

test("filters: football covers NFL and college; leagues follow today's order", () => {
  assert.ok(matchesGuideFilter("NFL", "football"));
  assert.ok(matchesGuideFilter("NCAAF", "football"));
  assert.ok(!matchesGuideFilter("NBA", "football"));
  assert.ok(matchesGuideFilter("NBA", "all"));
  assert.ok(matchesGuideFilter("NBA", "NBA"));
  const rows = [game("a", "NBA"), game("b", "NFL"), game("c", "NCAAF"), game("d", "NFL")].map(
    (g) => ({ game: g }),
  );
  assert.deepEqual(guideFilterLeagues(rows, prefs, SATURDAY), ["NCAAF", "NFL", "NBA"]);
  assert.deepEqual(guideFilterLeagues(rows, prefs, SATURDAY, "NHL"), [
    "NCAAF",
    "NFL",
    "NBA",
    "NHL",
  ]);
});

test("defaults to football on a football focus day", () => {
  assert.equal(defaultGuideFilter(prefs, SATURDAY), "football");
  assert.equal(defaultGuideFilter(prefs, TUESDAY), "all");
  assert.equal(defaultGuideFilter({ ...prefs, dayFocus: {} }, SATURDAY), "all");
});

test("next game after the window, on your channels and in the filter", () => {
  const games = [
    game("soon", "NFL"),
    game("nba-next", "NBA", { startMs: SATURDAY.getTime() + 5 * HOUR }),
    game("nfl-late", "NFL", { startMs: SATURDAY.getTime() + 8 * HOUR }),
    game("nfl-next", "NFL", { startMs: SATURDAY.getTime() + 6 * HOUR }),
    game("nfl-off", "NFL", { startMs: SATURDAY.getTime() + 5 * HOUR }),
  ];
  const channelsOf = (g: SportsGame) => (g.id === "nfl-off" ? [] : onAll(g));
  assert.equal(nextGuideGame(games, "all", { now: SATURDAY, channelsOf })?.id, "nba-next");
  assert.equal(nextGuideGame(games, "football", { now: SATURDAY, channelsOf })?.id, "nfl-next");
  assert.equal(nextGuideGame([], "all", { now: SATURDAY, channelsOf }), null);
});
