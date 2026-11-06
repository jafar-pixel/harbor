import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { readStudioDrag, STUDIO_DRAG_TYPE } from "../src/lib/music/studio/drag.ts";

type Deck = { song: object | null; playing: boolean };
type VideoDecks = {
  screenMix: (x: number, decks: [Deck, Deck]) => [number, number];
  screenZoom: (aspect: number | undefined) => number;
};

function load(): VideoDecks {
  const source = readFileSync(
    new URL("../src/lib/music/studio/video-decks.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mocks: Record<string, unknown> = {
    react: { useSyncExternalStore: () => null },
    "../dj/api": { videoAspects: async () => new Map() },
    "../dj/playhead": { pauseDj: () => {} },
    "../dj/youtube": { loadYouTube: async () => ({}), youtubeFrame: () => null },
    "../player/store": { pausePlayer: () => {} },
    "./engine": { xfadeGains: () => [1, 1] },
  };
  const exports = {} as VideoDecks;
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(id in mocks, id);
    return mocks[id];
  }, exports);
  return exports;
}

const { screenMix, screenZoom } = load();
const song = { videoId: "abcdefghijk" };
const on = { song, playing: true };
const cued = { song, playing: false };
const none = { song: null, playing: false };

test("a cued deck never shows over the video that's playing", () => {
  // The crossfader in the middle used to show both at half: the video and B's still cover.
  assert.deepEqual(screenMix(0, [on, cued]), [1, 0]);
  assert.deepEqual(screenMix(1, [on, cued]), [1, 0]);
  assert.deepEqual(screenMix(-1, [cued, on]), [0, 1]);
});

test("with both playing, one picture fills the screen except mid-blend", () => {
  assert.deepEqual(screenMix(-1, [on, on]), [1, 0]);
  assert.deepEqual(screenMix(-0.4, [on, on]), [1, 0]);
  assert.deepEqual(screenMix(0.4, [on, on]), [0, 1]);
  const [a, b] = screenMix(0, [on, on]);
  assert.ok(Math.abs(a - 0.5) < 1e-9 && Math.abs(b - 0.5) < 1e-9);
});

test("with nothing playing, the loaded deck on the crossfader's side shows alone", () => {
  assert.deepEqual(screenMix(-1, [cued, cued]), [1, 0]);
  assert.deepEqual(screenMix(1, [cued, cued]), [0, 1]);
  assert.deepEqual(screenMix(-1, [none, cued]), [0, 1]);
});

test("videos with black bars are enlarged to fill the 16:9 screen", () => {
  assert.equal(screenZoom(undefined), 1);
  assert.equal(screenZoom(16 / 9), 1);
  assert.ok(Math.abs(screenZoom(4 / 3) - 4 / 3) < 1e-9);
  assert.equal(screenZoom(9 / 16), 2.4);
});

function dropEvent(data: unknown) {
  return {
    dataTransfer: {
      types: [STUDIO_DRAG_TYPE],
      getData: (type: string) => (type === STUDIO_DRAG_TYPE ? JSON.stringify(data) : ""),
    },
  } as unknown as Parameters<typeof readStudioDrag>[0];
}

test("dragged songs are read back, and anything else is ignored", () => {
  assert.deepEqual(readStudioDrag(dropEvent({ kind: "crate", id: "f3" })), {
    kind: "crate",
    id: "f3",
  });
  assert.deepEqual(
    readStudioDrag(
      dropEvent({ kind: "video", song: { videoId: "dQw4w9WgXcQ", title: "T", artist: "A" } }),
    ),
    {
      kind: "video",
      song: {
        videoId: "dQw4w9WgXcQ",
        title: "T",
        artist: "A",
        art: null,
        bpm: undefined,
        key: undefined,
      },
    },
  );
  assert.equal(readStudioDrag(dropEvent({ kind: "video", song: { videoId: "bad id" } })), null);
  assert.equal(readStudioDrag(dropEvent({ kind: "other" })), null);
});
