import assert from "node:assert/strict";
import test from "node:test";
import {
  describeNativeTvCapabilities,
  nativeTvCapabilities,
  nativeTvOptions,
  parseNativeTvCapabilities,
  tvPassthroughAudio,
} from "../src/lib/player/native-tv/shell.ts";
import { browserDecodes, nativePlayback } from "../src/lib/player/native-playback.ts";
import { playabilityPenalty } from "../src/lib/streams/scoring/scoring-audio.ts";
import type { ParsedStream } from "../src/lib/streams/types.ts";

const g = globalThis as { window?: unknown };

const SHIELD = {
  maxWidth: 3840,
  maxHeight: 2160,
  refreshRates: [60, 23.976, 24, 59.94, 24],
  hdr: ["dolby-vision", "hdr10"],
  passthrough: ["ac3", "eac3", "dts"],
  pageBack: true,
};

function stream(audio: string, container = "mkv", codec = "HEVC"): ParsedStream {
  return { audio: { codec: audio, channels: 6 }, container, codec } as unknown as ParsedStream;
}

test("native playback: desktop app and TV app, not a plain browser", () => {
  g.window = {};
  assert.equal(nativePlayback(), false);
  assert.equal(browserDecodes("auto"), true);
  g.window = { __TAURI_INTERNALS__: {} };
  assert.equal(nativePlayback(), true);
  assert.equal(browserDecodes("auto"), false);
  assert.equal(browserDecodes("html5"), true, "the desktop html5 engine is still a browser");
  g.window = { JLNativePlayer: { isAvailable: () => true } };
  assert.equal(nativePlayback(), true);
  assert.equal(browserDecodes("html5"), false, "the TV app always plays natively");
  g.window = { JLNativePlayer: { isAvailable: () => false } };
  assert.equal(nativePlayback(), false);
  delete g.window;
});

test("capabilities: parsed defensively, read only from app builds that have them", () => {
  assert.equal(parseNativeTvCapabilities("not json"), null);
  assert.equal(parseNativeTvCapabilities(null), null);
  const caps = parseNativeTvCapabilities(JSON.stringify(SHIELD))!;
  assert.deepEqual(caps.refreshRates, [23.976, 24, 59.94, 60]);
  assert.equal(caps.maxHeight, 2160);
  assert.equal(caps.pageBack, true);
  assert.equal(parseNativeTvCapabilities({ hdr: [1, "hlg"] })!.pageBack, false);
  assert.deepEqual(parseNativeTvCapabilities({ hdr: [1, "hlg"] })!.hdr, ["hlg"]);

  g.window = { JLNativePlayer: { isAvailable: () => true } };
  assert.equal(nativeTvCapabilities(), null, "an older app build has no capabilities()");
  g.window = {
    JLNativePlayer: { isAvailable: () => true, capabilities: () => JSON.stringify(SHIELD) },
  };
  assert.equal(nativeTvCapabilities()?.maxWidth, 3840);
  delete g.window;
});

test("capabilities line for the settings page", () => {
  const caps = parseNativeTvCapabilities(SHIELD)!;
  assert.equal(
    describeNativeTvCapabilities(caps),
    "4K · HDR10, Dolby Vision · 23.976–60 Hz · Dolby Digital, Dolby Digital Plus, DTS passthrough",
  );
  assert.equal(
    describeNativeTvCapabilities({
      ...caps,
      maxWidth: 1920,
      maxHeight: 1080,
      hdr: [],
      refreshRates: [60],
      passthrough: [],
    }),
    "1080p · SDR · 60 Hz · No audio passthrough",
  );
});

test("passthrough audio follows the setting and what the receiver takes", () => {
  const caps = parseNativeTvCapabilities(SHIELD)!;
  assert.deepEqual(tvPassthroughAudio(true, caps), ["DTS"]);
  assert.deepEqual(tvPassthroughAudio(true, { ...caps, passthrough: ["truehd", "dts-hd"] }), [
    "DTS",
    "TrueHD",
  ]);
  assert.deepEqual(tvPassthroughAudio(false, caps), []);
  assert.equal(
    tvPassthroughAudio(true, null),
    undefined,
    "unknown receiver keeps the general rule",
  );
});

test("TV ranking: DTS and TrueHD are held back only when they cannot be passed through", () => {
  const dts = stream("DTS-HD MA");
  const truehd = stream("TrueHD");
  const ddp = stream("DD+");
  assert.equal(playabilityPenalty(ddp, []), 0, "HEVC in MKV with Dolby audio plays as is");
  assert.equal(playabilityPenalty(dts, ["DTS"]), 0);
  assert.equal(playabilityPenalty(truehd, ["TrueHD"]), 0);
  assert.ok(playabilityPenalty(dts, ["TrueHD"]) <= -20);
  assert.ok(playabilityPenalty(truehd, []) <= -20);
  assert.equal(playabilityPenalty(stream("AAC", "avi"), ["DTS"]), -8);
  assert.equal(playabilityPenalty(stream("AAC", "mp4", "AV1"), []), -2);
  // Outside the TV app the existing rule is unchanged.
  assert.equal(playabilityPenalty(dts), -6);
  assert.equal(playabilityPenalty(truehd), -7);
});

test("TV options sent to the app mirror the settings", () => {
  assert.deepEqual(
    nativeTvOptions({
      tvMatchFrameRate: true,
      tvMaxResolution: "auto",
      tvAudioPassthrough: false,
      tvTunneling: true,
    }),
    { matchFrameRate: true, maxResolution: "auto", audioPassthrough: false, tunneling: true },
  );
});
