import assert from "node:assert/strict";
import test from "node:test";
import { isNativeEnglishDubRequest } from "../src/lib/player/native-tv/shell.ts";

test("TV menu: the english-dub event asks the page for a dub source", () => {
  assert.ok(isNativeEnglishDubRequest({ type: "english-dub", mode: "full", positionMs: 1000 }));
  for (const detail of [
    null,
    undefined,
    "english-dub",
    {},
    { type: "tracks", audioTracks: [] },
    { type: "exit-full" },
  ]) {
    assert.equal(isNativeEnglishDubRequest(detail), false, JSON.stringify(detail));
  }
});
