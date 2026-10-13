import assert from "node:assert/strict";
import test from "node:test";
import { relaySuffix } from "../src/lib/iptv/home-relay.ts";

test("home relay: keeps the stream's file name so players can tell HLS from TS", () => {
  assert.equal(relaySuffix("http://p.example:80/live/u/p/123.m3u8"), "123.m3u8");
  assert.equal(relaySuffix("http://p.example/movie/u/p/456.mkv"), "456.mkv");
  assert.equal(
    relaySuffix("http://p.example/player_api.php?username=u&password=p"),
    "player_api.php",
  );
  assert.equal(relaySuffix("http://p.example/"), "media");
  assert.equal(relaySuffix("not a url"), "media");
});
