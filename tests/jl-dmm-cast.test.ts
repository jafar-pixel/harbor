import assert from "node:assert/strict";
import test from "node:test";
import {
  castCatalogs,
  isDmmCastAddonId,
  newCastBetween,
  parseCastLinks,
  pickYourCast,
} from "../src/lib/dmm-cast.ts";

test("DMM cast: recognises the Real-Debrid, TorBox and AllDebrid Cast addons only", () => {
  assert.equal(isDmmCastAddonId("com.debridmediamanager.cast"), true);
  assert.equal(isDmmCastAddonId("com.debridmediamanager.cast.torbox"), true);
  assert.equal(isDmmCastAddonId("com.debridmediamanager.cast.alldebrid"), true);
  assert.equal(isDmmCastAddonId("com.debridmediamanager.castaway"), false);
  assert.equal(isDmmCastAddonId("com.stremio.torrentio.addon"), false);
  assert.equal(isDmmCastAddonId(undefined), false);
});

test("DMM cast: plays your newest cast, never the cast option or someone else's", () => {
  const streams = [
    { name: "DMM Cast RD✨", title: "Cast a file inside a torrent", externalUrl: "https://x/y" },
    { name: "2160p", title: "Other.Movie.2160p.mkv\n🎬 DMM Cast RD", url: "https://dmm/play/a" },
    {
      name: "1080p",
      title: "My.Movie.1080p.WEB-\nDL.mkv\nDD 5.1\n🎬 DMM Cast RD (Yours)",
      url: "https://dmm/play/b",
    },
    {
      name: "720p",
      title: "Old.Movie.720p.mkv\n🎬 DMM Cast RD (Yours)",
      url: "https://dmm/play/c",
    },
  ];
  assert.deepEqual(pickYourCast(streams), {
    url: "https://dmm/play/b",
    title: "My.Movie.1080p.WEBDL.mkv",
  });
  assert.equal(pickYourCast(streams.slice(0, 2)), null);
  assert.equal(pickYourCast([{ title: "x (Yours)", url: "magnet:?xt=1" }]), null);
  assert.equal(pickYourCast([]), null);
});

test("DMM cast: the web app takes install and title links shared to it", async () => {
  const { sharedLinkFrom } = await import("../src/lib/shared-link.ts");
  const install = "https://debridmediamanager.com/api/stremio-tb/abc/manifest.json";
  assert.equal(sharedLinkFrom(`?link=${encodeURIComponent(install)}`), install);
  assert.equal(
    sharedLinkFrom(`?link_text=${encodeURIComponent(`Install this ${install}`)}`),
    install,
  );
  const cast = "stremio:///detail/movie/tt0816692/tt0816692";
  assert.equal(sharedLinkFrom(`?link=${encodeURIComponent(cast)}`), cast);
  assert.equal(sharedLinkFrom("?link=https%3A%2F%2Fexample.com%2Fpage"), null);
  assert.equal(sharedLinkFrom(""), null);
});

test("DMM cast receiver: finds the cast lists and acts only on a change", () => {
  assert.deepEqual(
    castCatalogs([
      { type: "movie", id: "tb-casted-movies" },
      { type: "series", id: "tb-casted-shows" },
      { type: "other", id: "tb-casted-other" },
    ]),
    { movie: "tb-casted-movies", series: "tb-casted-shows" },
  );
  assert.deepEqual(castCatalogs(undefined), { movie: undefined, series: undefined });

  const first = { movieId: "tt1", movieUrl: "https://dmm/play/a", showId: "tt9" };
  assert.equal(newCastBetween(undefined, first), null);
  assert.equal(newCastBetween(first, { ...first }), null);
  assert.deepEqual(newCastBetween(first, { ...first, movieId: "tt2" }), {
    type: "movie",
    id: "tt2",
  });
  assert.deepEqual(newCastBetween(first, { ...first, movieUrl: "https://dmm/play/b" }), {
    type: "movie",
    id: "tt1",
  });
  assert.deepEqual(newCastBetween(first, { ...first, showId: "tt8" }), {
    type: "series",
    id: "tt8",
  });
});

test("DMM cast links: only manifest links, each once", () => {
  const a = "https://debridmediamanager.com/api/stremio/abc/manifest.json";
  const b = "https://debridmediamanager.com/api/stremio-tb/def/manifest.json";
  assert.deepEqual(parseCastLinks(`${a}\n${b}\n${a}\nnot a link`), [a, b]);
  assert.deepEqual(parseCastLinks(""), []);
});
