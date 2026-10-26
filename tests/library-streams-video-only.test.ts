import assert from "node:assert/strict";
import test from "node:test";
import { fetchLibraryStreams } from "../src/lib/streams/library.ts";

const client = (entries: unknown[]) =>
  ({ slug: "rd", listLibrary: async () => ({ ok: true, data: entries }) }) as never;

const movie = { type: "movie" as const, imdbId: "tt1", title: "Home Alone", year: 1990 };

test("music in the debrid library is never offered as a movie", async () => {
  const streams = await fetchLibraryStreams(
    [
      client([
        { hash: "a", name: "Home.mp3" },
        { hash: "b", name: "Home Alone OST", files: [{ name: "01 Home Alone.flac" }] },
        { hash: "c", name: "Home Alone 1990 Soundtrack FLAC" },
      ]),
    ],
    movie,
    new AbortController().signal,
  );
  assert.deepEqual(streams, []);
});

test("the video file in a release is the one that plays", async () => {
  const streams = await fetchLibraryStreams(
    [
      client([
        {
          hash: "d",
          name: "Home Alone 1990 1080p",
          files: [{ name: "theme.mp3" }, { name: "Home.Alone.1990.1080p.mkv" }],
        },
      ]),
    ],
    movie,
    new AbortController().signal,
  );
  assert.equal(streams.length, 1);
  assert.equal(streams[0].fileIdx, 1);
});
