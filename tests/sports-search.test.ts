import assert from "node:assert/strict";
import test from "node:test";
import { matchScore, searchChannels, searchGames } from "../src/lib/sports/sports-search.ts";
import type { SportsGame } from "../src/lib/sports/espn-types.ts";

const side = (name: string, abbr: string) => ({
  id: abbr,
  name,
  abbr,
  logo: "",
  score: "",
  winner: false,
});
const game = (
  id: string,
  home: string,
  away: string,
  state: SportsGame["state"],
  startMs: number,
) =>
  ({
    id,
    league: "NFL",
    state,
    detail: "",
    home: side(home, home.slice(0, 3).toUpperCase()),
    away: side(away, away.slice(0, 3).toUpperCase()),
    startMs,
  }) as SportsGame;

test("every typed word must match, accents and case ignored", () => {
  assert.ok(matchScore("Atlético Madrid", "atletico mad") > 0);
  assert.equal(matchScore("Dallas Cowboys", "cowboys giants"), 0);
  assert.ok(matchScore("Dallas Cowboys", "cowboys") > matchScore("Dallas Cowboys", "boys"));
});

test("games: live first, then the soonest", () => {
  const games = [
    game("1", "Dallas Cowboys", "Giants", "post", 1),
    game("2", "Dallas Cowboys", "Eagles", "pre", 300),
    game("3", "Dallas Cowboys", "Commanders", "in", 200),
    game("4", "Dallas Cowboys", "49ers", "pre", 100),
    game("5", "Chiefs", "Raiders", "in", 50),
  ];
  assert.deepEqual(
    searchGames(games, "cowboys").map((g) => g.id),
    ["3", "4", "2", "1"],
  );
  assert.deepEqual(searchGames([...games, games[0]], "cowboys").length, 4, "no duplicates");
});

test("channels: sports only, hidden ones left out", () => {
  const ch = (name: string, group: string) => ({
    id: name,
    tvgId: null,
    name,
    logo: null,
    group,
    url: "",
    catchupSource: null,
    durationSec: null,
    attrs: {},
  });
  const list = [
    ch("ESPN HD", "USA Sports"),
    ch("ESPN News", "USA Sports"),
    ch("HGTV", "Lifestyle"),
    ch("ESPN 2", "USA Sports"),
  ];
  const isSports = (_n: string, g: string | null) => g === "USA Sports";
  assert.deepEqual(
    searchChannels(list, "espn", isSports).map((c) => c.name),
    ["ESPN 2", "ESPN HD", "ESPN News"],
  );
  assert.deepEqual(
    searchChannels(list, "espn", isSports, (n) => n === "ESPN News").map((c) => c.name),
    ["ESPN 2", "ESPN HD"],
  );
  assert.deepEqual(searchChannels(list, "hgtv", isSports), [], "never a non-sports channel");
});
