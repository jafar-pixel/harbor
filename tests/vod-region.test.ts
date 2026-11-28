import assert from "node:assert/strict";
import test from "node:test";
import { usaVodLibrary, vodCountry } from "../src/lib/iptv/vod-region.ts";

test("vod region: country from the group or a title tag", () => {
  assert.equal(vodCountry({ group: "USA | Movies", title: "Sinners" }), "US");
  assert.equal(vodCountry({ group: "FR VOD", title: "Amélie" }), "FR");
  assert.equal(vodCountry({ group: null, title: "DE - Das Boot" }), "DE");
  assert.equal(vodCountry({ group: "Movies", title: "Bad Boys" }), null);
  assert.equal(vodCountry({ group: null, title: "Spider-Man - No Way Home" }), null);
});

test("vod region: Pro keeps US and untagged titles only", () => {
  const m = (title: string, group: string | null) => ({ title, group }) as never;
  const lib = usaVodLibrary({
    movies: [m("A", "USA Movies"), m("B", "FR Films"), m("C", null)],
    series: [m("D", "UK | Series"), m("E", "US Series")],
  });
  assert.deepEqual(
    lib.movies.map((x: { title: string }) => x.title),
    ["A", "C"],
  );
  assert.deepEqual(
    lib.series.map((x: { title: string }) => x.title),
    ["E"],
  );
});
