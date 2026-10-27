import assert from "node:assert/strict";
import test from "node:test";
import { refreshJudders } from "../src/lib/player/motion-interp.ts";

test("uneven refresh rates get smoothing", () => {
  assert.equal(refreshJudders(75.03, 23.976), true);
  assert.equal(refreshJudders(60, 23.976), true);
  assert.equal(refreshJudders(60, 25), true);
  assert.equal(refreshJudders(120, 23.976), false);
  assert.equal(refreshJudders(60, 59.94), false);
  assert.equal(refreshJudders(50, 25), false);
  assert.equal(refreshJudders(0, 24), false);
});
