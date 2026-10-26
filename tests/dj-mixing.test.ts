import assert from "node:assert/strict";
import test from "node:test";
import {
  harmonicOrder,
  keyMatch,
  phrasePlan,
  transitionGains,
  transitionStyle,
} from "../src/lib/music/dj/mixing.ts";

test("keys sit on the Camelot wheel", () => {
  assert.equal(keyMatch("8A", "8A"), "same");
  assert.equal(keyMatch("8A", "9A"), "neighbour");
  assert.equal(keyMatch("12B", "1B"), "neighbour");
  assert.equal(keyMatch("8A", "8B"), "relative");
  assert.equal(keyMatch("8A", "10A"), "boost");
  assert.equal(keyMatch("8A", "3B"), "clash");
  assert.equal(keyMatch("8A", undefined), null);
});

test("the set flows by key and tempo", () => {
  const order = harmonicOrder({ key: "8A", bpm: 120 }, [
    { key: "3B", bpm: 90, n: 1 },
    { key: "9A", bpm: 122, n: 2 },
    { key: "8A", bpm: 121, n: 3 },
    { n: 4 },
  ]);
  assert.deepEqual(
    order.map((s) => s.n),
    [3, 2, 1, 4],
  );
});

test("transitions land on a phrase and finish before the end", () => {
  const plan = phrasePlan(120, 200, "blend");
  assert.equal(plan.beats, 16);
  assert.equal(plan.seconds, 8);
  assert.equal(plan.start % 16, 0);
  assert.ok(plan.start + plan.seconds <= 197);
  assert.deepEqual(phrasePlan(undefined, 200, "blend"), { start: 192, seconds: 8, beats: 0 });
});

test("each transition has its own shape", () => {
  assert.equal(transitionStyle({ bpm: 120 }, { bpm: 150 }), "cut");
  assert.equal(transitionStyle({ energy: 9 }, { energy: 4 }), "fade");
  assert.equal(transitionStyle({ key: "8A" }, { key: "3B" }), "chop");
  assert.equal(transitionStyle({ key: "8A", bpm: 120 }, { key: "9A", bpm: 124 }), "blend");
  assert.deepEqual(transitionGains("cut", 0.5, 0), [1, 0]);
  const [out, inn] = transitionGains("blend", 1, 0);
  assert.ok(out < 0.001 && inn === 1);
});
