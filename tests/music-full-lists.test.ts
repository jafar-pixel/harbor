import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

/** Loads a module with its imports replaced by `mocks` and `fetch` answered by `respond`. */
function load<T>(
  path: string,
  mocks: Record<string, unknown>,
  respond: (url: URL, init?: RequestInit) => unknown,
) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const urls: URL[] = [];
  const fetch = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    urls.push(url);
    const body = respond(url, init);
    return { ok: true, status: 200, json: async () => body };
  };
  const exports = {} as T;
  new Function("require", "exports", "fetch", compiled)(
    (id: string) => {
      assert.ok(id in mocks, id);
      return mocks[id];
    },
    exports,
    fetch,
  );
  return { mod: exports, urls };
}

const video = (n: number) => ({
  snippet: {
    title: `Artist ${n} - Song ${n}`,
    resourceId: { videoId: `v${n}` },
    thumbnails: {},
  },
});

test("a YouTube playlist reads every page, not just the first 50", async () => {
  const { mod, urls } = load<{ youtubePlaylistSongs: (id: string) => Promise<unknown[]> }>(
    "src/lib/music/youtube-web/api.ts",
    {
      "./auth": { youtubeWebToken: async () => "t" },
      "./songs": {
        songFromVideo: (title: string) => {
          const [artist, song] = title.split(" - ");
          return { artist, title: song };
        },
        channelArtist: (s: string) => s,
      },
    },
    (url) => {
      const page = Number(url.searchParams.get("pageToken") ?? 0);
      const size = page < 2 ? 50 : 20;
      return {
        items: Array.from({ length: size }, (_, i) => video(page * 50 + i)),
        nextPageToken: page < 2 ? String(page + 1) : undefined,
      };
    },
  );
  const songs = await mod.youtubePlaylistSongs("PL1");
  assert.equal(songs.length, 120);
  assert.equal(urls.length, 3);
  assert.deepEqual(
    urls.map((u) => u.searchParams.get("pageToken")),
    [null, "1", "2"],
  );
});

const track = (n: number) => ({
  track: { id: `t${n}`, name: `Song ${n}`, artists: [{ name: "A" }], album: { name: "B" } },
});

test("Spotify liked songs and playlists page through offsets until the end", async () => {
  const total = 130;
  const { mod, urls } = load<{
    spotifyLikedTracks: (limit?: number) => Promise<unknown[]>;
    spotifyPlaylistTracks: (id: string) => Promise<unknown[]>;
  }>(
    "src/lib/music/spotify-web/api.ts",
    { "./auth": { spotifyWebToken: async () => "t" } },
    (url) => {
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      const count = Math.max(0, Math.min(limit, total - offset));
      return {
        items: Array.from({ length: count }, (_, i) => track(offset + i)),
        next: offset + count < total ? "more" : null,
      };
    },
  );

  const liked = await mod.spotifyLikedTracks(200);
  assert.equal(liked.length, 130);
  assert.deepEqual(
    urls.map((u) => `${u.searchParams.get("limit")}@${u.searchParams.get("offset")}`),
    ["50@0", "50@50", "50@100"],
  );

  urls.length = 0;
  const playlist = await mod.spotifyPlaylistTracks("p1");
  assert.equal(playlist.length, 130);
  assert.deepEqual(
    urls.map((u) => `${u.pathname}?${u.searchParams.get("limit")}@${u.searchParams.get("offset")}`),
    ["/v1/playlists/p1/items?100@0", "/v1/playlists/p1/items?100@100"],
  );

  urls.length = 0;
  assert.equal((await mod.spotifyLikedTracks(20)).length, 20);
  assert.equal(urls.length, 1);
});

test("browse lists ask the search for a full page of 50; single songs still ask for 6", async () => {
  const sent: unknown[] = [];
  const { mod } = load<{
    searchVideos: (q: string, kind?: string, max?: number) => Promise<unknown[]>;
  }>(
    "src/lib/music/dj/api.ts",
    {
      "@/lib/jl/account/client": {
        jlAccountContext: () => ({ userId: "u1" }),
        jlFunction: async (_name: string, init: { body: string }) => {
          sent.push(JSON.parse(init.body));
          return { ok: true, json: async () => ({ results: [] }) };
        },
      },
    },
    () => ({}),
  );
  await mod.searchVideos("new hip hop", "music", 50);
  await mod.searchVideos("Artist - Song");
  assert.deepEqual(sent, [
    { q: "new hip hop", kind: "music", max: 50 },
    { q: "Artist - Song", kind: "music", max: 6 },
  ]);
});
