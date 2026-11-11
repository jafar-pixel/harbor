import assert from "node:assert/strict";
import test from "node:test";
import { healthKey, healthOf } from "../src/lib/iptv/channel-health.ts";
import type { IptvChannel } from "../src/lib/iptv/types.ts";
import { nextFeed } from "../src/views/player/hooks/use-live-failover.ts";

const day = 24 * 60 * 60_000;

test("a channel that failed and hasn't worked since is failing, for three days", () => {
  const now = 10 * day;
  assert.equal(healthOf(undefined, now), "unknown");
  assert.equal(healthOf({ ok: 0, fail: 1, lastOkAt: 0, lastFailAt: now - 1000 }, now), "failing");
  assert.equal(
    healthOf({ ok: 3, fail: 1, lastOkAt: now - 500, lastFailAt: now - 1000 }, now),
    "working",
  );
  // An old failure no longer counts.
  assert.equal(
    healthOf({ ok: 0, fail: 4, lastOkAt: 0, lastFailAt: now - 4 * day }, now),
    "unknown",
  );
});

test("a fresh token on the same stream is the same channel", () => {
  assert.equal(
    healthKey("http://p.test/live/u/p/123.m3u8?token=abc"),
    healthKey("http://p.test/live/u/p/123.m3u8?token=xyz"),
  );
});

const ch = (id: string): IptvChannel => ({
  id,
  tvgId: null,
  name: id,
  logo: null,
  group: null,
  url: `http://p.test/${id}`,
  catchupSource: null,
  durationSec: null,
  attrs: {},
});

test("a failed feed moves on to the next one for the game, skipping known failures", () => {
  const feeds = [ch("a"), ch("b"), ch("c")];
  assert.equal(nextFeed(feeds, "a", () => false)?.id, "b");
  assert.equal(nextFeed(feeds, "a", (u) => u.endsWith("/b"))?.id, "c");
  assert.equal(
    nextFeed(feeds, "c", () => false),
    null,
  );
  assert.equal(
    nextFeed(feeds, "zzz", () => false),
    null,
  );
});
