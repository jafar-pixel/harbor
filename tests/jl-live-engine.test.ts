import assert from "node:assert/strict";
import test from "node:test";
import { chooseEngine } from "../src/lib/player/live-src.ts";

// A live channel exactly as Live TV and Sports build it (playback-source.ts).
const channel = { meta: { id: "iptv:espn", type: "tv" }, isLive: true, notWebReady: true };

test("a live channel always plays in the browser player, never mpv's separate window", () => {
  for (const setting of ["auto", "html5", "mpv"] as const) {
    assert.equal(chooseEngine(channel, setting, false), "html5");
    assert.equal(chooseEngine(channel, setting, true), "html5");
  }
});

test("movies and shows keep the viewer's engine", () => {
  const movie = { meta: { id: "tt0111161", type: "movie" } };
  assert.equal(chooseEngine(movie, "mpv", false), "mpv");
  assert.equal(chooseEngine(movie, "auto", false), "auto");
  assert.equal(chooseEngine(movie, "auto", true), "mpv");
});
