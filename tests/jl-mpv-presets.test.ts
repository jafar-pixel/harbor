import assert from "node:assert/strict";
import test from "node:test";
import {
  activeJlPreset,
  applyJlPreset,
  JL_PRESETS,
  jlAutoLines,
  jlAutoUsesMpvHdr,
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

test("automatic: Sports HDR for live channels in HDR, Cinema otherwise, nothing once the viewer chooses", () => {
  const live = jlAutoLines({ live: true, hdrOutput: true, tweaks: {} });
  assert.match(live, /inverse-tone-mapping=yes/);
  assert.match(live, /interpolation=yes/);
  assert.equal(jlAutoUsesMpvHdr({ live: true, hdrOutput: true, tweaks: {} }), true);
  const sdr = jlAutoLines({ live: true, hdrOutput: false, tweaks: {} });
  assert.doesNotMatch(sdr, /inverse-tone-mapping/);
  assert.match(sdr, /scale=ewa_lanczossharp/);
  assert.equal(jlAutoLines({ live: true, hdrOutput: true, tweaks: { deband: "no" } }), "");
  assert.equal(
    jlAutoLines({ live: false, hdrOutput: true, tweaks: { brightness: "4" } }).length > 0,
    true,
  );
});

test("the viewer's own picture tweaks keep the automatic setup on", () => {
  const tweaks = { sharpen: "0.6", "tone-mapping": "spline", "target-peak": "500" };
  assert.match(jlAutoLines({ live: true, hdrOutput: true, tweaks }), /inverse-tone-mapping=yes/);
});
