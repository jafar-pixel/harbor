// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  ALL_SOUNDS,
  BRAINWAVES,
  MOOD_PRESETS,
  cleanMix,
  soundById,
} from "../src/lib/music/sounds/catalog.ts";
import {
  fadeGain,
  lowBandShare,
  natureSamples,
  noiseSamples,
} from "../src/lib/music/sounds/generators.ts";

const RATE = 22050;
const LEN = RATE * 2;

test("brainwave beats sit inside their bands, slowest to fastest", () => {
  let last = 0;
  for (const b of BRAINWAVES) {
    assert.ok(b.beatHz >= b.range[0] && b.beatHz <= b.range[1], `${b.id} beat outside its band`);
    assert.ok(b.beatHz > last, `${b.id} is out of order`);
    assert.ok(b.carrierHz > b.beatHz * 2, `${b.id} carrier too low for its beat`);
    last = b.beatHz;
  }
  assert.deepEqual(
    BRAINWAVES.map((b) => b.band),
    ["delta", "theta", "alpha", "beta", "gamma"],
  );
});

test("noise colours lean the right way: brown low, white even, blue and violet high", () => {
  const share = (c: Parameters<typeof noiseSamples>[0]) =>
    lowBandShare(noiseSamples(c, LEN, RATE), RATE, 300);
  const brown = share("brown");
  const pink = share("pink");
  const white = share("white");
  const blue = share("blue");
  const violet = share("violet");
  assert.ok(
    brown > pink && pink > white && white > blue && blue > violet,
    `${brown} ${pink} ${white} ${blue} ${violet}`,
  );
  assert.ok(brown > 0.8, "brown noise should be mostly low rumble");
});

test("generated loops are normalised, finite and repeatable", () => {
  for (const c of ["white", "pink", "brown", "green", "blue", "violet"] as const) {
    const a = noiseSamples(c, LEN, RATE, 3);
    const b = noiseSamples(c, LEN, RATE, 3);
    assert.deepEqual(a, b, `${c} not repeatable for one seed`);
    let peak = 0;
    for (const v of a) {
      assert.ok(Number.isFinite(v));
      peak = Math.max(peak, Math.abs(v));
    }
    assert.ok(peak > 0.5 && peak <= 0.91, `${c} peak ${peak}`);
  }
  for (const bed of ["rain", "ocean", "wind", "river", "fire", "thunder"] as const) {
    const data = natureSamples(bed, LEN, RATE);
    assert.ok(
      data.every((v) => Number.isFinite(v) && Math.abs(v) <= 0.91),
      `${bed} out of range`,
    );
  }
});

test("presets use known sounds and mixes are cleaned", () => {
  for (const preset of MOOD_PRESETS) {
    for (const layer of preset.layers) assert.ok(soundById(layer.id), `${preset.id}: ${layer.id}`);
  }
  assert.equal(new Set(ALL_SOUNDS.map((s) => s.id)).size, ALL_SOUNDS.length, "duplicate sound ids");
  const mix = cleanMix({
    name: "",
    beatMode: "weird" as never,
    layers: [
      { id: "rain", volume: 2 },
      { id: "rain", volume: 0.3 },
      { id: "nope", volume: 0.5 },
      { id: "delta", volume: Number.NaN },
    ],
  });
  assert.deepEqual(mix, {
    name: "My mix",
    beatMode: "binaural",
    layers: [
      { id: "rain", volume: 1 },
      { id: "delta", volume: 0.5 },
    ],
  });
});

test("the sleep fade runs from full to silent", () => {
  assert.equal(fadeGain(0, 60), 1);
  assert.ok(Math.abs(fadeGain(60, 60)) < 1e-9);
  assert.ok(fadeGain(30, 60) > 0.6 && fadeGain(30, 60) < 0.8);
  assert.equal(fadeGain(10, 0), 0);
});
