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

test("a big channel list is prepared once, in slices, and searched fast", async () => {
  const { buildSportsChannelIndex, searchChannelIndex } =
    await import("../src/lib/sports/sports-search.ts");
  const ch = (i: number, sports: boolean) => ({
    id: `c${i}`,
    tvgId: null,
    name: sports ? `ESPN ${i}` : `Movie Channel ${i}`,
    logo: null,
    group: sports ? "USA Sports" : "Movies",
    url: "",
    catchupSource: null,
    durationSec: null,
    attrs: {},
  });
  const list = Array.from({ length: 20_000 }, (_, i) => ch(i, i % 10 === 0));
  let yields = 0;
  const index = await buildSportsChannelIndex(list, (_n, g) => g === "USA Sports", {
    slice: 1000,
    yieldTo: async () => {
      yields += 1;
    },
  });
  assert.equal(index!.length, 2000, "only the sports channels are kept");
  assert.equal(yields, 19, "the page gets a turn between slices");
  assert.deepEqual(
    searchChannelIndex(index!, "espn 100", undefined, 3).map((c) => c.name),
    ["ESPN 100", "ESPN 1000", "ESPN 10000"],
  );
  assert.equal(await buildSportsChannelIndex(list, () => true, { stopped: () => true }), null);
});
