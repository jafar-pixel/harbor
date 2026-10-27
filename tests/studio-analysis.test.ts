import assert from "node:assert/strict";
import test from "node:test";
import { beatGrid, waveform } from "../src/lib/music/studio/analysis.ts";
import { xfadeGains } from "../src/lib/music/studio/engine.ts";

/** A kick drum on every beat, with hats between, as a stand-in for an AudioBuffer. */
function drumLoop(bpm: number, seconds: number, offset = 0.1, sampleRate = 22050) {
  const data = new Float32Array(Math.floor(seconds * sampleRate));
  const beat = 60 / bpm;
  for (let t = offset; t < seconds; t += beat) {
    const start = Math.floor(t * sampleRate);
    for (let i = 0; i < sampleRate * 0.12 && start + i < data.length; i++) {
      const env = Math.exp(-i / (sampleRate * 0.03));
      data[start + i] += Math.sin((2 * Math.PI * 55 * i) / sampleRate) * env * 0.9;
    }
    const hat = Math.floor((t + beat / 2) * sampleRate);
    for (let i = 0; i < sampleRate * 0.02 && hat + i < data.length; i++)
      data[hat + i] += (Math.random() * 2 - 1) * 0.2 * Math.exp(-i / (sampleRate * 0.005));
  }
  return {
    sampleRate,
    numberOfChannels: 1,
    duration: seconds,
    length: data.length,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

test("tempo and first beat of a steady loop", () => {
  for (const bpm of [92, 128, 140, 174]) {
    const grid = beatGrid(drumLoop(bpm, 60, 0.1));
    assert.equal(grid.bpm, bpm, `${bpm} detected as ${grid.bpm}`);
    const beat = 60 / bpm;
    const off = Math.min(
      Math.abs(grid.offset - 0.1) % beat,
      beat - (Math.abs(grid.offset - 0.1) % beat),
    );
    assert.ok(off < 0.03, `offset ${grid.offset} for ${bpm}`);
  }
});

test("waveform has one bin per 1/150 s, scaled to 0-1", () => {
  const wave = waveform(drumLoop(120, 10));
  assert.ok(Math.abs(wave.peak.length - 1500) < 3);
  assert.ok(Math.max(...wave.peak) <= 1);
});

test("crossfader curves", () => {
  assert.deepEqual(xfadeGains(-1, "linear"), [1, 0]);
  const [a, b] = xfadeGains(0, "smooth");
  assert.ok(Math.abs(a - Math.SQRT1_2) < 1e-9 && Math.abs(b - Math.SQRT1_2) < 1e-9);
  assert.deepEqual(xfadeGains(0, "cut"), [1, 1]);
  assert.deepEqual(xfadeGains(1, "cut"), [0, 1]);
});
