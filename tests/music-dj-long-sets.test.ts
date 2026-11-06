import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

type Song = { artist: string; title: string; why: string };
type Session = {
  startDj: (vibe: object, styles: string[]) => Promise<void>;
  goTo: (index: number, styles?: string[]) => void;
  djState: () => { tracks: Song[]; status: string };
};

/** session.ts with a fake DJ that hands back `perCall` new songs (or `limit` songs in all). */
function session(perCall: (count: number) => number, limit = Infinity) {
  const source = readFileSync(new URL("../src/lib/music/dj/session.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const asked: { count: number; avoid: number }[] = [];
  let made = 0;
  const key = (s: { artist: string; title: string }) => `${s.artist} - ${s.title}`;
  const mocks: Record<string, unknown> = {
    react: { useSyncExternalStore: () => null },
    "../preferences": { readMusicPreference: () => null, writeMusicPreference: () => {} },
    "../tastes/styles": { resolveStyles: () => [], seedArtists: () => [] },
    "./account-seeds": { accountSeeds: () => [] },
    "./mixing": { harmonicOrder: (_: unknown, list: unknown[]) => list },
    "./api": {
      askDj: async (ask: { count: number; avoid?: string[] }) => {
        asked.push({ count: ask.count, avoid: ask.avoid?.length ?? 0 });
        const n = Math.min(perCall(ask.count), limit - made);
        const tracks = Array.from({ length: Math.max(0, n) }, () => {
          made++;
          return { artist: "A", title: `Song ${made}`, why: "" };
        });
        return { intro: "", tracks, discover: [], colors: null, sounds: [] };
      },
      searchVideos: async () => [],
    },
    "./vibes": { pickVideo: () => null, songKey: key, songQuery: key },
  };
  const exports = {} as Session;
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(id in mocks, id);
    return mocks[id];
  }, exports);
  return { dj: exports, asked };
}

const settle = () => new Promise((r) => setTimeout(r, 20));
const vibe = {
  id: "v",
  name: "Late night",
  prompt: "late night r&b",
  colors: ["#000000", "#ffffff"],
};

test("a vibe opens with 25 songs and grows to 50 on its own", async () => {
  const { dj, asked } = session((count) => count);
  await dj.startDj(vibe, []);
  await settle();
  assert.equal(dj.djState().tracks.length, 50);
  assert.deepEqual(
    asked.map((a) => a.count),
    [25, 20, 5],
  );
});

test("the DJ answering short still fills the set, and stops when it has nothing new", async () => {
  const short = session(() => 7);
  await short.dj.startDj(vibe, []);
  await settle();
  assert.ok(short.dj.djState().tracks.length >= 50);

  const dry = session((count) => count, 30);
  await dry.dj.startDj(vibe, []);
  await settle();
  assert.equal(dry.dj.djState().tracks.length, 30);
  assert.equal(dry.asked.length, 3);
});

test("playing toward the end asks for more, so the set never runs out", async () => {
  const { dj, asked } = session((count) => count);
  await dj.startDj(vibe, []);
  await settle();
  const before = dj.djState().tracks.length;
  dj.goTo(before - 15);
  await settle();
  assert.equal(dj.djState().tracks.length, before + 20);
  assert.ok(asked.at(-1)!.avoid <= 200);
});
