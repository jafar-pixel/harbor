import assert from "node:assert/strict";
import test from "node:test";
import { localDay, picksForDay } from "../src/lib/iptv/today-picks.ts";

const pick = {
  channel: {
    id: "p1::nba02",
    tvgId: null,
    name: "NBA 02",
    logo: null,
    group: "USA NBA",
    url: "https://x/2.ts",
    catchupSource: null,
    durationSec: null,
    attrs: {},
  },
  title: "Knicks vs Timberwolves",
};

test("picks belong to the day they were made", () => {
  const day = localDay(new Date(2026, 9, 28, 23, 50));
  assert.equal(day, "2026-10-28");
  assert.deepEqual(picksForDay({ day, picks: [pick] }, day), [pick]);
  assert.deepEqual(picksForDay({ day, picks: [pick] }, localDay(new Date(2026, 9, 29, 0, 5))), []);
  assert.deepEqual(picksForDay(null, day), []);
});
