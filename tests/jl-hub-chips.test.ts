import assert from "node:assert/strict";
import test from "node:test";
import {
  gamesForChip,
  hubChips,
  hubFeedLeagues,
  liveTodayGames,
  nextSevenDays,
} from "../src/lib/sports/hub-chips.ts";
import type { SportsGame } from "../src/lib/sports/espn-types.ts";

const leagues = [
  { key: "NFL", tag: "NFL", group: "football" },
  { key: "NCAAF", tag: "NCAAF", group: "football" },
  { key: "NBA", tag: "NBA", group: "basketball" },
  { key: "F1", tag: "F1", group: "motorsport" },
  { key: "UFC", tag: "UFC", group: "combat" },
  { key: "LCK", tag: "LCK", group: "esports" },
  { key: "CS2", tag: "CS2", group: "esports" },
];
const side = { name: "", abbr: "", logo: "", score: "" } as unknown as SportsGame["home"];
const game = (id: string, league: string, startMs: number, state: SportsGame["state"] = "pre") =>
  ({ id, league, startMs, state, detail: "", home: side, away: side }) as SportsGame;

test("chips follow Personalize, then add Formula 1, MMA and one Esports chip", () => {
  const chips = hubChips(["NBA", "NFL", "LCK"], leagues);
  assert.deepEqual(
    chips.map((c) => c.key),
    ["NBA", "NFL", "F1", "UFC", "esports"],
  );
  assert.deepEqual(chips.at(-1)?.tags, ["LCK", "CS2"]);
  assert.deepEqual(hubFeedLeagues(chips, leagues), ["NFL", "NBA", "F1", "UFC", "LCK", "CS2"]);
});

test("a chip shows only its own league, never the rest of its sport", () => {
  const chips = hubChips(["NFL", "NCAAF"], leagues);
  const games = [game("a", "NFL", 1), game("b", "NCAAF", 2), game("c", "NBA", 3)];
  assert.deepEqual(
    gamesForChip(games, chips, "NFL").map((g) => g.id),
    ["a"],
  );
  assert.deepEqual(
    gamesForChip(games, chips, "all").map((g) => g.id),
    ["a", "b"],
  );
});

test("Live Today and Next 7 days windows", () => {
  const now = new Date(2026, 9, 29, 18, 0).getTime();
  const h = 3_600_000;
  const games = [
    game("later", "NBA", now + 2 * h),
    game("live", "NBA", now - h, "in"),
    game("done", "NBA", now - 5 * h, "post"),
    game("tomorrow", "NBA", now + 26 * h),
    game("far", "NBA", now + 8 * 24 * h),
  ];
  assert.deepEqual(
    liveTodayGames(games, now).map((g) => g.id),
    ["live", "later", "done"],
  );
  assert.deepEqual(
    nextSevenDays(games, now).map((g) => g.id),
    ["live", "later", "tomorrow"],
  );
});

test("each chip shows its own league's channels", async () => {
  const { chipTvLeague } = await import("../src/lib/jl/sports/chip-tv-league.ts");
  const chips = hubChips(
    ["NBA", "NCAAF", "F1", "UFC"],
    [...leagues, { key: "EPL", tag: "EPL", group: "soccer" }],
  );
  const byKey = (k: string) => chips.find((c) => c.key === k);
  assert.equal(chipTvLeague(byKey("NBA")), "NBA");
  assert.equal(chipTvLeague(byKey("NCAAF")), "NCAAF");
  assert.equal(chipTvLeague(byKey("F1")), "Racing");
  assert.equal(chipTvLeague(byKey("UFC")), "Fights");
  assert.equal(chipTvLeague(byKey("esports")), null);
});
