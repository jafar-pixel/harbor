import assert from "node:assert/strict";
import test from "node:test";
import { screenZoom } from "../src/lib/music/video-zoom.ts";

test("a square cover in a wide frame is enlarged to fill it", () => {
  assert.ok(Math.abs(screenZoom(1, 16 / 9) - 16 / 9) < 1e-9);
});

test("a wide video in a wide frame is left as it is", () => {
  assert.equal(screenZoom(16 / 9, 16 / 9), 1);
});

test("unknown shapes and odd frames change nothing; the zoom is capped", () => {
  assert.equal(screenZoom(undefined), 1);
  assert.equal(screenZoom(0), 1);
  assert.equal(screenZoom(1, 0), 1);
  assert.equal(screenZoom(0.2, 16 / 9), 2.4);
});
