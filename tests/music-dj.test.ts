// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  VIBES,
  crossfade,
  pickVideo,
  songKey,
  type VideoResult,
} from "../src/lib/music/dj/vibes.ts";

const v = (id: string, title: string, channel: string): VideoResult => ({
  id,
  title,
  channel,
  thumb: "",
});

test("the DJ picks the real recording over covers, live takes and other songs", () => {
  const song = { artist: "Kenny G", title: "Songbird", why: "" };
  const results = [
    v("a", "Songbird - Kenny G (Saxophone Cover)", "SaxGuy"),
    v("b", "Kenny G - Songbird (Live at the Summit)", "Concerts"),
    v("c", "Kenny G - Forever in Love", "Kenny G"),
    v("d", "Songbird", "Kenny G - Topic"),
    v("e", "Kenny G - Songbird (Official Video)", "KennyGVEVO"),
  ];
  assert.equal(pickVideo(song, results)?.id, "e");
  assert.equal(pickVideo(song, results.slice(0, 3)), null);
});

test("an artist's band suffix and punctuation don't stop a match", () => {
  const song = { artist: "Bob Marley & The Wailers", title: "Three Little Birds", why: "" };
  const pick = pickVideo(song, [
    v("x", "Bob Marley - Three Little Birds (Official Music Video)", "Bob Marley"),
  ]);
  assert.equal(pick?.id, "x");
  const remix = { artist: "Burna Boy", title: "Last Last (Remix)", why: "" };
  assert.equal(pickVideo(remix, [v("r", "Burna Boy - Last Last (Remix)", "Burna Boy")])?.id, "r");
});

test("a song named with feat. or an edition still finds the artist's own video", () => {
  const feat = { artist: "Drake", title: "Nice For What (feat. Big Freedia)", why: "" };
  assert.equal(
    pickVideo(feat, [
      v("o", "Drake - Nice For What (Official Video)", "DrakeVEVO"),
      v("x", "Nice For What", "Random Covers"),
    ])?.id,
    "o",
  );
  const edition = { artist: "Fleetwood Mac", title: "Dreams - 2004 Remaster", why: "" };
  assert.equal(
    pickVideo(edition, [v("d", "Fleetwood Mac - Dreams (Official Music Video)", "Fleetwood Mac")])
      ?.id,
    "d",
  );
  // The core title alone isn't enough from someone else's channel.
  assert.equal(pickVideo(feat, [v("y", "Nice For What dance", "Dance Crew")]), null);
  // An exact title still wins over a core-title match.
  assert.equal(
    pickVideo(feat, [
      v("c", "Drake - Nice For What", "Drake"),
      v("f", "Drake - Nice For What (feat. Big Freedia)", "Drake"),
    ])?.id,
    "f",
  );
});

test("the crossfade keeps equal power from start to finish", () => {
  assert.deepEqual(
    crossfade(0).map((x) => Math.round(x * 1000) / 1000),
    [1, 0],
  );
  assert.deepEqual(
    crossfade(1).map((x) => Math.round(x * 1000) / 1000),
    [0, 1],
  );
  for (const p of [0.1, 0.5, 0.9]) {
    const [out, inn] = crossfade(p);
    assert.ok(Math.abs(out * out + inn * inn - 1) < 1e-9);
  }
});

test("vibes are unique with valid colours, and songs have one identity", () => {
  assert.equal(new Set(VIBES.map((x) => x.id)).size, VIBES.length);
  for (const x of VIBES) for (const c of x.colors) assert.match(c, /^#[0-9a-f]{6}$/i);
  assert.equal(songKey({ artist: "Nas", title: "N.Y. State of Mind" }), "Nas - N.Y. State of Mind");
});
