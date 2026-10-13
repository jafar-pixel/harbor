import assert from "node:assert/strict";
import test from "node:test";
import { isDmmCastAddonId, pickYourCast } from "../src/lib/dmm-cast.ts";

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
