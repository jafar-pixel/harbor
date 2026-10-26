import assert from "node:assert/strict";
import test from "node:test";
import { channelArtist, songFromVideo } from "../src/lib/music/youtube-web/songs.ts";

test("video titles become artist and song", () => {
  assert.deepEqual(
    songFromVideo("A Tribe Called Quest - Award Tour (Official Video)", "ATCQ VEVO"),
    {
      artist: "A Tribe Called Quest",
      title: "Award Tour",
    },
  );
  assert.deepEqual(songFromVideo("Bob Marley – Is This Love [Official Music Video]", "x"), {
    artist: "Bob Marley",
    title: "Is This Love",
  });
});

test("a plain title takes the artist from a Topic or VEVO channel", () => {
  assert.deepEqual(songFromVideo("Money Trees", "Kendrick Lamar - Topic"), {
    artist: "Kendrick Lamar",
    title: "Money Trees",
  });
  assert.equal(channelArtist("KendrickLamarVEVO"), "KendrickLamar");
  assert.equal(channelArtist("Erykah Badu - Topic"), "Erykah Badu");
});
