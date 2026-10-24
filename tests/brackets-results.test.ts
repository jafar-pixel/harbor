import assert from "node:assert/strict";
import test from "node:test";
import type { SportsGame } from "../src/lib/sports/espn-types.ts";
import { buildTournament } from "../src/lib/sports/brackets/engine.ts";
import {
  fieldFromStandings,
  finalTotal,
  resultsFromGames,
} from "../src/lib/sports/brackets/results.ts";

const team = (id: string) => ({ teamId: id, league: "X", name: `T${id}`, abbr: id, logo: "" });
const final = (
  league: string,
  home: string,
  away: string,
  homeWins: boolean,
  startMs = 1,
  score = ["20", "17"],
): SportsGame => ({
  id: `${home}-${away}-${startMs}`,
  league,
  state: "post",
  detail: "Final",
  postseason: true,
  startMs,
  home: {
    id: home,
    name: home,
    abbr: home,
    logo: "",
    score: homeWins ? score[0] : score[1],
    winner: homeWins,
  },
  away: {
    id: away,
    name: away,
    abbr: away,
    logo: "",
    score: homeWins ? score[1] : score[0],
    winner: !homeWins,
  },
});

test("single games decide CFP matchups in order", () => {
  const t = buildTournament("cfp");
  const field = Object.fromEntries(t.entrants.map((k, i) => [k, team(String(i + 1))]));
  // 12 (id 12) beats 5 (id 5) in round one, then 4 (id 4) beats 12 in the quarterfinal.
  const games = [final("NCAAF", "5", "12", false, 1), final("NCAAF", "4", "12", true, 2)];
  const r = resultsFromGames(t, field, games);
  assert.equal(r.r1m1, "CFP:12");
  assert.equal(r.r2m1, "CFP:4");
  assert.equal(Object.keys(r).length, 2);
});

test("NBA series need four wins", () => {
  const t = buildTournament("nba");
  const field = { "East:1": team("a"), "East:8": team("h") };
  const three = [1, 2, 3].map((n) => final("NBA", "a", "h", true, n));
  assert.equal(resultsFromGames(t, field, three)["East-r1m1"], undefined);
  const four = [...three, final("NBA", "h", "a", false, 4)];
  assert.equal(resultsFromGames(t, field, four)["East-r1m1"], "East:1");
});

test("MLB Wild Card is best of three, the World Series best of seven", () => {
  const t = buildTournament("mlb");
  const field = { "AL:4": team("p"), "AL:5": team("q") };
  const games = [final("MLB", "p", "q", false, 1), final("MLB", "q", "p", true, 2)];
  assert.equal(resultsFromGames(t, field, games)["AL-r1m1"], "AL:5");
});

test("regular-season and other leagues' games don't count", () => {
  const t = buildTournament("cfp");
  const field = { "CFP:5": team("5"), "CFP:12": team("12") };
  const reg = { ...final("NCAAF", "5", "12", false), postseason: false };
  const nfl = final("NFL", "5", "12", false);
  assert.deepEqual(resultsFromGames(t, field, [reg, nfl]), {});
});

test("the final's total is read once the champion is known", () => {
  const t = buildTournament("cfp");
  const field = Object.fromEntries(t.entrants.map((k, i) => [k, team(String(i + 1))]));
  const results = {
    r1m1: "CFP:5",
    r1m2: "CFP:8",
    r1m3: "CFP:6",
    r1m4: "CFP:7",
    r2m1: "CFP:4",
    r2m2: "CFP:1",
    r2m3: "CFP:3",
    r2m4: "CFP:2",
    r3m1: "CFP:1",
    r3m2: "CFP:2",
    r4m1: "CFP:1",
  };
  const game = final("NCAAF", "1", "2", true, 9, ["34", "28"]);
  assert.equal(finalTotal(t, field, [game], results), 62);
  assert.equal(finalTotal(t, field, [game], {}), null);
});

test("standings seeds fill NFL conferences; committee formats stay empty", () => {
  const rows = (prefix: string) =>
    Array.from({ length: 16 }, (_, i) => ({
      teamId: `${prefix}${i + 1}`,
      name: `${prefix}${i + 1}`,
      shortName: "",
      abbr: "",
      logo: "",
      rank: 16 - i,
      note: "",
      played: null,
      wins: null,
      draws: null,
      losses: null,
    }));
  const table = {
    leagueTag: "NFL",
    leagueName: "NFL",
    sport: "football",
    season: "2026",
    columns: [],
    groups: [
      { id: "1", name: "American Football Conference", rows: rows("A") },
      { id: "2", name: "National Football Conference", rows: rows("N") },
    ],
  } as never;
  const field = fieldFromStandings(buildTournament("nfl"), table, "NFL");
  assert.equal(Object.keys(field).length, 14);
  assert.equal(field["AFC:1"].teamId, "A16");
  assert.equal(field["NFC:7"].teamId, "N10");
  assert.deepEqual(fieldFromStandings(buildTournament("cfp"), table, "NCAAF"), {});
});

test("postseason windows cross the new year for the CFP", async () => {
  const { postseasonQuery } = await import("../src/lib/sports/brackets/results.ts");
  assert.equal(postseasonQuery("cfp", 2027), "20261210-20270131&seasontype=3&limit=500");
  assert.ok(postseasonQuery("mlb", 2026).startsWith("20260925-20261110"));
});
