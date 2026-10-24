import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTournament,
  championOf,
  cleanPicks,
  participants,
  scoreBracket,
  type Winners,
} from "../src/lib/sports/brackets/engine.ts";

test("every format has the right size", () => {
  const sizes = {
    cfp: [12, 11],
    nfl: [14, 13],
    nba: [16, 15],
    mlb: [12, 11],
    ncaam: [68, 67],
    ncaaw: [68, 67],
  } as const;
  for (const [kind, [entrants, games]] of Object.entries(sizes)) {
    const t = buildTournament(kind as keyof typeof sizes);
    assert.equal(t.entrants.length, entrants, `${kind} entrants`);
    assert.equal(t.matchups.length, games, `${kind} games`);
    assert.equal(new Set(t.matchups.map((m) => m.id)).size, games, `${kind} unique ids`);
  }
});

test("CFP: byes meet the right first-round winners", () => {
  const t = buildTournament("cfp");
  const picks: Winners = { r1m1: "CFP:12", r1m2: "CFP:8", r1m3: "CFP:6", r1m4: "CFP:10" };
  assert.deepEqual(participants(t, "r2m1", picks), ["CFP:4", "CFP:12"]);
  assert.deepEqual(participants(t, "r2m2", picks), ["CFP:1", "CFP:8"]);
  assert.deepEqual(participants(t, "r2m4", picks), ["CFP:2", "CFP:10"]);
});

test("NFL: the top seed plays the lowest remaining seed", () => {
  const t = buildTournament("nfl");
  // Chalk: 2, 3, 4 advance -> 1 v 4, 2 v 3.
  let picks: Winners = { "AFC-r1m1": "AFC:2", "AFC-r1m2": "AFC:3", "AFC-r1m3": "AFC:4" };
  assert.deepEqual(participants(t, "AFC-r2m1", picks), ["AFC:1", "AFC:4"]);
  assert.deepEqual(participants(t, "AFC-r2m2", picks), ["AFC:2", "AFC:3"]);
  // The 7 seed upsets the 2 -> 1 v 7, 3 v 4.
  picks = { "AFC-r1m1": "AFC:7", "AFC-r1m2": "AFC:3", "AFC-r1m3": "AFC:4" };
  assert.deepEqual(participants(t, "AFC-r2m1", picks), ["AFC:1", "AFC:7"]);
  assert.deepEqual(participants(t, "AFC-r2m2", picks), ["AFC:3", "AFC:4"]);
  // Until all three wild-card games are picked, the divisional round is undecided.
  assert.deepEqual(participants(t, "AFC-r2m1", { "AFC-r1m1": "AFC:2" }), ["AFC:1", null]);
});

test("MLB: the 1 seed meets the 4/5 winner, no reseeding", () => {
  const t = buildTournament("mlb");
  assert.deepEqual(participants(t, "AL-r2m1", { "AL-r1m1": "AL:5" }), ["AL:1", "AL:5"]);
  assert.deepEqual(participants(t, "AL-r2m2", { "AL-r1m2": "AL:6" }), ["AL:2", "AL:6"]);
});

test("March Madness: First Four feeds its region slot, 16 v 1 in round one", () => {
  const t = buildTournament("ncaam");
  assert.deepEqual(participants(t, "East-r1m1", { "ff-East-16": "East:16b" }), [
    "East:1",
    "East:16b",
  ]);
  const finals = t.matchups.filter((m) => m.round === 5);
  assert.equal(finals.length, 2);
  assert.equal(t.matchups.filter((m) => m.round === 0).length, 4);
});

test("changing an early pick clears the picks that depended on it", () => {
  const t = buildTournament("cfp");
  const picks: Winners = { r1m1: "CFP:5", r2m1: "CFP:5", r3m1: "CFP:5", r4m1: "CFP:5" };
  assert.equal(championOf(t, picks), "CFP:5");
  const changed = cleanPicks(t, { ...picks, r1m1: "CFP:12" });
  assert.deepEqual(changed, { r1m1: "CFP:12" });
  assert.equal(championOf(t, changed), null);
});

test("scoring: round points, and dead picks leave the possible total", () => {
  const t = buildTournament("cfp");
  const picks: Winners = { r1m1: "CFP:5", r1m2: "CFP:8", r2m1: "CFP:5", r2m2: "CFP:1" };
  // 12 upsets 5 (miss), 8 beats 9 (hit, 10 points). 5 is out, so its quarterfinal pick is dead.
  const results: Winners = { r1m1: "CFP:12", r1m2: "CFP:8" };
  const s = scoreBracket(t, picks, results);
  assert.equal(s.points, 10);
  assert.equal(s.correct, 1);
  assert.equal(s.possible, 10 + 20);
});
