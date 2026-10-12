import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TV_CANVAS, parseTvCanvas } from "../src/lib/tv-canvas.ts";

test("TV canvas: only the offered sizes, otherwise the default", () => {
  assert.equal(parseTvCanvas("1600"), 1600);
  assert.equal(parseTvCanvas("1920"), 1920);
  assert.equal(parseTvCanvas(null), DEFAULT_TV_CANVAS);
  assert.equal(parseTvCanvas("1000"), DEFAULT_TV_CANVAS);
  assert.equal(parseTvCanvas("abc"), DEFAULT_TV_CANVAS);
});
