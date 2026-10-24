import assert from "node:assert/strict";
import test from "node:test";
import { watchProviders } from "../src/lib/sports/watch-providers.ts";
import type { SportsGame } from "../src/lib/sports/espn-types.ts";

const game = (league: string, broadcasts: string[]): SportsGame => ({
  id: "fixture",
  league,
  broadcasts,
  state: "pre",
  startMs: 0,
  detail: "",
  home: { id: "1", name: "Home", abbr: "", logo: "", score: "", winner: false },
  away: { id: "2", name: "Away", abbr: "", logo: "", score: "", winner: false },
});

test("WNBA TV resolves to WNBA League Pass without a substring match to NBA", () => {
  const providers = watchProviders(game("WNBA", ["WNBA TV", "Peacock"]));
  assert.equal(providers.find((provider) => provider.id === "wnba")?.listed, true);
  assert.equal(providers.find((provider) => provider.id === "peacock")?.listed, true);
  assert.equal(
    providers.some((provider) => provider.id === "nba"),
    false,
  );
});

test("broadcaster matching accepts suffixes while rejecting letters inside other names", () => {
  const providers = watchProviders(game("NHL", ["ESPN+", "CNBC", "CBS Sports Network"]));
  assert.equal(providers.find((provider) => provider.id === "espn")?.listed, true);
  assert.equal(providers.find((provider) => provider.id === "paramount")?.listed, true);
  assert.equal(
    providers.some((provider) => provider.id === "peacock"),
    false,
  );
});

test("a suggested official subscription does not claim listed event coverage", () => {
  const providers = watchProviders(game("MLB", []));
  assert.equal(providers.find((provider) => provider.id === "mlb")?.listed, false);
  assert.equal(new URL(providers[0].url).hostname, "www.mlb.com");
});

test("BoxCast is offered on every game, listed when the broadcast names it", () => {
  const plain = watchProviders(game("NCAAF", []));
  assert.deepEqual(
    plain.map((provider) => [provider.id, provider.listed]),
    [["boxcast", false]],
  );
  const named = watchProviders(game("NCAAF", ["BoxCast"]));
  assert.equal(named.filter((provider) => provider.id === "boxcast").length, 1);
  assert.equal(named.find((provider) => provider.id === "boxcast")?.listed, true);
  const nba = watchProviders(game("NBA", ["ESPN"]));
  assert.equal(nba[nba.length - 1].id, "boxcast");
});
