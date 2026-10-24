import assert from "node:assert/strict";
import test from "node:test";
import { buildTournament } from "../src/lib/sports/brackets/engine.ts";
import { leaderboard } from "../src/lib/sports/brackets/leaderboard.ts";

const t = buildTournament("cfp");
const results = { r1m1: "CFP:12", r1m2: "CFP:8" };

test("ranks by points, then tiebreaker, and shares tied ranks", () => {
  const rows = leaderboard(
    t,
    [
      { userId: "a", name: "Ana", picks: { r1m1: "CFP:5", r1m2: "CFP:8" }, tiebreaker: 50 },
      { userId: "b", name: "Ben", picks: { r1m1: "CFP:12", r1m2: "CFP:8" }, tiebreaker: 40 },
      { userId: "c", name: "Cal", picks: { r1m1: "CFP:12", r1m2: "CFP:9" }, tiebreaker: 60 },
      { userId: "d", name: "Dee", picks: { r1m1: "CFP:12", r1m2: "CFP:9" }, tiebreaker: 60 },
    ],
    results,
  );
  assert.deepEqual(
    rows.map((r) => [r.name, r.rank, r.points]),
    [
      ["Ben", 1, 20],
      ["Ana", 2, 10],
      ["Cal", 2, 10],
      ["Dee", 2, 10],
    ],
  );
});

test("the final's real total breaks ties", () => {
  const rows = leaderboard(
    t,
    [
      { userId: "a", name: "Far", picks: { r1m1: "CFP:12" }, tiebreaker: 70 },
      { userId: "b", name: "Near", picks: { r1m1: "CFP:12" }, tiebreaker: 48 },
    ],
    results,
    45,
  );
  assert.deepEqual(
    rows.map((r) => [r.name, r.rank]),
    [
      ["Near", 1],
      ["Far", 2],
    ],
  );
});
