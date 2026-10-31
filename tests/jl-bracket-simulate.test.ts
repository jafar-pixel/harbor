import assert from "node:assert/strict";
import test from "node:test";
import { buildTournament, championOf, participants } from "../src/lib/sports/brackets/engine.ts";
import { autoFill, pickShares, seededRandom } from "../src/lib/sports/brackets/simulate.ts";

test("favorites fill every game with the better seed", () => {
  const t = buildTournament("nfl");
  const picks = autoFill(t, {}, "favorites");
  assert.equal(Object.keys(picks).length, t.matchups.length);
  const champ = championOf(t, picks)!;
  assert.match(champ, /:1$/);
});

test("stats pick the better record, and existing picks are kept", () => {
  const t = buildTournament("nba");
  const first = t.matchups.find((m) => m.round === Math.min(...t.matchups.map((x) => x.round)))!;
  const [a, b] = participants(t, first.id, {});
  const ratings = { [a!]: 0.4, [b!]: 0.7 };
  const picks = autoFill(t, {}, "stats", { ratings });
  assert.equal(picks[first.id], b);
  const kept = autoFill(t, { [first.id]: a! }, "favorites");
  assert.equal(kept[first.id], a);
});

test("upsets are repeatable with a seed and can pick an underdog", () => {
  const t = buildTournament("ncaam");
  const one = autoFill(t, {}, "upsets", { random: seededRandom(7) });
  const two = autoFill(t, {}, "upsets", { random: seededRandom(7) });
  assert.deepEqual(one, two);
  const fav = autoFill(t, {}, "favorites");
  assert.notDeepEqual(one, fav);
});

test("pool pick shares per game", () => {
  const t = buildTournament("nfl");
  const m = t.matchups[0];
  const [a, b] = participants(t, m.id, {});
  const shares = pickShares(t, [{ [m.id]: a! }, { [m.id]: a! }, { [m.id]: b! }, {}]);
  assert.equal(Math.round(shares[m.id][a!] * 100), 67);
});
