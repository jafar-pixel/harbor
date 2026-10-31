import assert from "node:assert/strict";
import test from "node:test";
import {
  activeJlPreset,
  applyJlPreset,
  JL_PRESETS,
} from "../src/lib/player/jl-presets.ts";

const byId = (id: string) => JL_PRESETS.find((p) => p.id === id)!;

test("a preset replaces the keys it owns and keeps the viewer's others", () => {
  const before = { sharpen: "0.6", brightness: "4", "inverse-tone-mapping": "yes" };
  const after = applyJlPreset(before, byId("cinema"));
  assert.equal(after.sharpen, undefined);
  assert.equal(after["inverse-tone-mapping"], undefined);
  assert.equal(after.brightness, "4");
  assert.equal(after.scale, "ewa_lanczossharp");
});

test("Sports HDR uses mpv's HDR expansion, never NVIDIA's on top of it", () => {
  const p = byId("sports-hdr");
  assert.equal(p.tweaks["inverse-tone-mapping"], "yes");
  assert.equal(p.player.playerRtxHdr, false);
  assert.equal(p.player.playerHdrToSdr, false);
});

test("the active preset is recognised, including a moved brightness slider", () => {
  const p = byId("sports-hdr");
  const tweaks = { ...applyJlPreset({}, p), "target-peak": "450" };
  assert.equal(activeJlPreset(tweaks, p.player), "sports-hdr");
  assert.equal(activeJlPreset({ ...tweaks, deband: "no" }, p.player), null);
});

test("Sports HDR adds HDR color only, no motion smoothing or display retiming", () => {
  const p = byId("sports-hdr");
  assert.equal(p.tweaks.interpolation, undefined);
  assert.equal(p.tweaks.tscale, undefined);
  assert.equal(p.tweaks["video-sync"], undefined);
});
