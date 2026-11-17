import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RULES,
  compileRules,
  filterPlaylist,
  trimGuide,
  xmltvTime,
} from "../server/smart-list.ts";

const PLAYLIST = `#EXTM3U x-tvg-url="https://example.test/epg"
#EXTINF:-1 tvg-id="ESPN.us" tvg-logo="https://logo/espn.png" group-title="US| SPORTS",US: ESPN FHD
#EXTVLCOPT:http-user-agent=Custom
http://provider.test/live/u/p/1.ts
#EXTINF:-1 tvg-id="CNN.us" group-title="USA NEWS",CNN
http://provider.test/live/u/p/2.ts
#EXTINF:-1 tvg-id="SkySportsMain.uk" group-title="UK| SPORTS",UK: Sky Sports Main Event
http://provider.test/live/u/p/3.ts
#EXTINF:-1 tvg-id="BBCOne.uk" group-title="UK| ENTERTAINMENT",UK: BBC One
http://provider.test/live/u/p/4.ts
#EXTINF:-1 tvg-id="" group-title="PPV EVENTS",PPV 01: UFC 320
http://provider.test/live/u/p/5.ts
#EXTINF:-1 group-title="FR| SPORTS",FR: Canal+ Sport
http://provider.test/live/u/p/6.ts
#EXTINF:-1 group-title="ANIME 24/7",Crunchyroll Anime
http://provider.test/live/u/p/7.ts
#EXTINF:-1 group-title="US| ADULTS",US: Late
http://provider.test/live/u/p/8.ts
#EXTINF:-1 group-title="US| MOVIES",US: The Movie (2024)
http://provider.test/movie/u/p/9.mkv
`;

async function run(text: string) {
  let out = "";
  const result = await filterPlaylist(text.split("\n"), compileRules(DEFAULT_RULES), (t) => {
    out += t;
  });
  return { out, ...result };
}

test("keeps US channels, UK sports, sports events and anime; drops the rest", async () => {
  const { out, stats } = await run(PLAYLIST);
  assert.equal(stats.total, 9);
  assert.equal(stats.kept, 5);
  assert.deepEqual(stats.byRule, {
    "US channels": 2,
    "UK sports": 1,
    "Sports events": 1,
    Anime: 1,
  });
  for (const kept of ["ESPN FHD", "CNN", "Sky Sports Main Event", "UFC 320", "Crunchyroll"])
    assert.match(out, new RegExp(kept));
  for (const dropped of ["BBC One", "Canal+", "Late", "The Movie"])
    assert.doesNotMatch(out, new RegExp(dropped.replace("+", "\\+")));
});

test("kept entries are copied exactly, options lines included", async () => {
  const { out } = await run(PLAYLIST);
  assert.ok(out.startsWith("#EXTM3U\n"));
  assert.match(
    out,
    /#EXTINF:-1 tvg-id="ESPN.us" tvg-logo="https:\/\/logo\/espn.png" group-title="US\| SPORTS",US: ESPN FHD\n#EXTVLCOPT:http-user-agent=Custom\nhttp:\/\/provider.test\/live\/u\/p\/1.ts\n/,
  );
});

test("dropped groups are listed so the rules can be checked", async () => {
  const { stats } = await run(PLAYLIST);
  const dropped = Object.fromEntries(stats.droppedGroups);
  assert.equal(dropped["UK| ENTERTAINMENT"], 1);
  assert.equal(dropped["FR| SPORTS"], 1);
});

test("xmltv times with and without an offset", () => {
  assert.equal(xmltvTime("20261115190000 +0000"), Date.UTC(2026, 10, 15, 19));
  assert.equal(xmltvTime("20261115140000 -0500"), Date.UTC(2026, 10, 15, 19));
  assert.equal(xmltvTime("20261115190000"), Date.UTC(2026, 10, 15, 19));
  assert.ok(Number.isNaN(xmltvTime("soon")));
});

test("guide keeps kept channels' entries inside the window, split across chunks", async () => {
  const now = Date.UTC(2026, 10, 15, 19);
  const guide = `<?xml version="1.0"?><tv>
<channel id="ESPN.us"><display-name>ESPN</display-name></channel>
<channel id="BBCOne.uk"><display-name>BBC One</display-name></channel>
<channel id="X1"><display-name>CNN</display-name></channel>
<programme start="20261115180000 +0000" stop="20261115200000 +0000" channel="ESPN.us"><title>Game</title></programme>
<programme start="20261110180000 +0000" stop="20261110200000 +0000" channel="ESPN.us"><title>Old</title></programme>
<programme start="20261125180000 +0000" stop="20261125200000 +0000" channel="ESPN.us"><title>Far</title></programme>
<programme start="20261115180000 +0000" stop="20261115200000 +0000" channel="BBCOne.uk"><title>Drama</title></programme>
<programme start="20261115190000 +0000" stop="20261115200000 +0000" channel="X1"><title>News</title></programme>
</tv>`;
  async function* chunks() {
    for (let i = 0; i < guide.length; i += 7) yield guide.slice(i, i + 7);
  }
  let out = "";
  const stats = await trimGuide(
    chunks(),
    { guideIds: new Set(["espn.us"]), names: new Set(["cnn"]) },
    { fromMs: now - 2 * 3_600_000, toMs: now + 36 * 3_600_000 },
    (t) => {
      out += t;
    },
  );
  assert.deepEqual(stats, { channels: 2, programmes: 2 });
  assert.match(out, /<title>Game<\/title>/);
  assert.match(out, /<title>News<\/title>/);
  for (const gone of ["Old", "Far", "Drama", "BBC One"]) assert.doesNotMatch(out, new RegExp(gone));
  assert.ok(out.trim().endsWith("</tv>"));
});
