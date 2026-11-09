import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

type Cast = { type: string; id: string };
type Watch = (onCast: (cast: Cast) => void, intervalMs?: number) => () => void;

/**
 * dmm-cast.ts with one Cast addon installed whose server answers through `respond`: the casted
 * movies list, and the movie's streams. `respond` returning null is a failed or timed-out request.
 */
function load(respond: (url: string, call: number) => unknown) {
  const source = readFileSync(new URL("../src/lib/dmm-cast.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const addon = {
    transportUrl: "https://dmm.example/api/stremio/key/manifest.json",
    manifest: {
      id: "com.debridmediamanager.cast",
      catalogs: [{ type: "movie", id: "pm-casted-movies" }],
    },
  };
  let call = 0;
  const mocks: Record<string, unknown> = {
    "@/lib/addon-store": {
      loadInstalled: () => [addon],
      filterEnabled: (list: unknown[]) => list,
      installFromUrl: async () => {},
    },
    "@/lib/safe-fetch": {
      safeFetch: async (url: string) => {
        const body = respond(url, call++);
        return body === null
          ? { ok: false, json: async () => ({}) }
          : { ok: true, json: async () => body };
      },
    },
  };
  const exports = {} as { watchDmmCasts: Watch };
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(id in mocks, id);
    return mocks[id];
  }, exports);
  return exports.watchDmmCasts;
}

const until = (ms: number) => new Promise((r) => setTimeout(r, ms));
const list = (id: string) => ({ metas: [{ id }] });
const streams = (file: string, link: string) => ({
  streams: [{ url: link, title: `${file}\n(Yours)` }],
});

test("the same cast never reopens, though its lookup fails now and then and its link changes", async () => {
  let n = 0;
  const watch = load((url) => {
    if (url.includes("/catalog/")) return list("tt0000001");
    n++;
    // Every third lookup times out; each good one hands back a fresh link for the same file.
    if (n % 3 === 0) return null;
    return streams("Hope.2026.2160p.mkv", `https://pm.example/dl/${n}?token=${n}`);
  });
  const casts: Cast[] = [];
  const stop = watch((c) => casts.push(c), 5);
  await until(150);
  stop();
  assert.ok(n >= 6, `polled ${n} times`);
  assert.deepEqual(casts, []);
});

test("a new cast still reaches this device", async () => {
  let movie = "tt0000001";
  const watch = load((url) => {
    if (url.includes("/catalog/")) return list(movie);
    return streams(movie === "tt0000001" ? "Hope.mkv" : "Other.mkv", "https://pm.example/dl");
  });
  const casts: Cast[] = [];
  const stop = watch((c) => casts.push(c), 5);
  await until(40);
  movie = "tt0000002";
  await until(40);
  stop();
  assert.deepEqual(casts, [{ type: "movie", id: "tt0000002" }]);
});
