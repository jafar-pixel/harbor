import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MUSIC_AUDIO } from "../src/lib/music/audio-settings.ts";
import { dbToGain, sameOriginMedia, webEqPlan } from "../src/lib/music/web-eq.ts";

const base = { ...DEFAULT_MUSIC_AUDIO, eqBands: [...DEFAULT_MUSIC_AUDIO.eqBands] };

test("no EQ while it is off or bypassed", () => {
  assert.equal(
    webEqPlan({ ...base, eqEnabled: false, eqBands: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
    null,
  );
  assert.equal(webEqPlan({ ...base, eqEnabled: true, dspBypass: true }), null);
});

test("graphic EQ: ten bands at the app's frequencies, scaled by strength", () => {
  const plan = webEqPlan({
    ...base,
    eqEnabled: true,
    eqStrength: 0.5,
    autoHeadroom: false,
    eqBands: [6, 5, 3, 2, -1, -1, 1, 2, 3, 3],
  });
  assert.ok(plan);
  assert.equal(plan.filters.length, 10);
  assert.deepEqual(
    plan.filters.map((f) => f.frequency),
    [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  );
  assert.equal(plan.filters[0].gain, 3);
  assert.equal(plan.filters[0].type, "peaking");
  assert.equal(plan.preampDb, 0);
});

test("auto headroom lowers the level by the biggest boost", () => {
  const plan = webEqPlan({
    ...base,
    eqEnabled: true,
    autoHeadroom: true,
    preampDb: 1,
    eqBands: [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
  });
  assert.equal(plan?.preampDb, -6);
  const cut = webEqPlan({
    ...base,
    eqEnabled: true,
    autoHeadroom: true,
    eqBands: Array(10).fill(-4),
  });
  assert.equal(cut?.preampDb, 0);
});

test("parametric EQ keeps only switched-on filters, with Web Audio types", () => {
  const plan = webEqPlan({
    ...base,
    eqEnabled: true,
    eqMode: "parametric",
    autoHeadroom: false,
    peqFilters: [
      { type: "lowShelf", frequency: 100, gain: 4, q: 0.7, enabled: true },
      { type: "notch", frequency: 3000, gain: 0, q: 5, enabled: true },
      { type: "peak", frequency: 1000, gain: 9, q: 1, enabled: false },
    ],
  });
  assert.deepEqual(
    plan?.filters.map((f) => f.type),
    ["lowshelf", "notch"],
  );
});

test("which addresses the page may process", () => {
  const origin = "https://watch.jl-stream.com";
  assert.equal(sameOriginMedia("blob:https://watch.jl-stream.com/x", origin), true);
  assert.equal(sameOriginMedia("/secure/abc", origin), true);
  assert.equal(sameOriginMedia("https://jellyfin.example.com/a.flac", origin), null);
  assert.ok(Math.abs(dbToGain(-6) - 0.501) < 0.001);
});
