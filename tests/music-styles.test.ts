// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  STYLE_GENRES,
  STYLE_ID,
  customStyleKey,
  resolveStyles,
  seedArtists,
  styleKey,
} from "../src/lib/music/tastes/styles.ts";
import { validateProfileData } from "../src/lib/jl/account/profile-data.ts";

test("every genre asks its question and every style id is valid and unique", () => {
  assert.deepEqual(
    STYLE_GENRES.map((g) => g.id),
    ["hip-hop", "jazz", "rock", "gospel", "reggae", "international"],
  );
  for (const genre of STYLE_GENRES) {
    assert.match(genre.question, /^What type of .+ do you listen to\?$/);
    const ids = new Set<string>();
    for (const style of genre.styles) {
      const key = styleKey(genre.id, style.id);
      assert.match(key, STYLE_ID);
      assert.ok(!ids.has(style.id), `${key} is listed twice`);
      ids.add(style.id);
      assert.ok(style.artists.length >= 3, `${key} needs seed artists`);
    }
  }
});

test("custom styles become safe ids and resolve back to a readable name", () => {
  assert.equal(customStyleKey("jazz", "Gypsy Jazz!"), "jazz/x-gypsy-jazz");
  assert.equal(customStyleKey("reggae", "Música Jíbara"), "reggae/x-musica-jibara");
  assert.equal(customStyleKey("polka", "Oom-pah"), null);
  assert.equal(customStyleKey("jazz", "!!!"), null);
  const resolved = resolveStyles(["jazz/x-gypsy-jazz", "hip-hop/boom-bap", "rock/nope", "bad"]);
  assert.deepEqual(
    resolved.map((r) => [r.key, r.name]),
    [
      ["jazz/x-gypsy-jazz", "Gypsy Jazz"],
      ["hip-hop/boom-bap", "Boom Bap / 90s East Coast"],
    ],
  );
});

test("seed artists interleave across picked styles", () => {
  const seeds = seedArtists(["jazz/smooth", "reggae/roots"], 4);
  assert.deepEqual(seeds, [
    "Kenny G",
    "Bob Marley & The Wailers",
    "George Benson",
    "Burning Spear",
  ]);
  assert.deepEqual(seedArtists([]), []);
});

test("picked styles sync with the JL profile, and nothing else rides along", () => {
  const values = { "settings:musicStyles": ["hip-hop/trap", "jazz/x-gypsy-jazz"] };
  assert.deepEqual(validateProfileData(values), values);
  assert.throws(() => validateProfileData({ "settings:musicStyles": ["https://evil.example"] }));
  assert.throws(() => validateProfileData({ "settings:musicStyles": "hip-hop/trap" }));
});
