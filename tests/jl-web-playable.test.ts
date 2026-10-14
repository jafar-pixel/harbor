import assert from "node:assert/strict";
import test from "node:test";
import {
  canWebTranscode,
  isWebKitUserAgent,
  needsWebTranscode,
  type WebPlaybackEnv,
} from "../src/lib/player/web-playable.ts";
import { deviceLabelForUserAgent } from "../src/lib/device-label.ts";

const NATIVE: WebPlaybackEnv = { web: false, webkit: false };
const CHROME: WebPlaybackEnv = { web: true, webkit: false };
const SAFARI: WebPlaybackEnv = { web: true, webkit: true };

const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const IPAD_LEGACY =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

test("web playable: the desktop and TV apps never transcode", () => {
  assert.equal(needsWebTranscode("Movie.2160p.HEVC.TrueHD.mkv", NATIVE), false);
  assert.equal(needsWebTranscode(null, NATIVE), false);
});

test("web playable: MKV and AVI need a transcode in every browser", () => {
  assert.equal(needsWebTranscode("Movie.2020.1080p.WEB-DL.x264.AAC.mkv", CHROME), true);
  assert.equal(needsWebTranscode("Old.Show.S01E01.avi", CHROME), true);
  assert.equal(
    needsWebTranscode("https://abc.download.real-debrid.com/d/XYZ/Movie%20Name.MKV", CHROME),
    true,
  );
});

test("web playable: codec tags no browser plays reliably", () => {
  for (const name of [
    "Movie.2020.1080p.HEVC.AAC.mp4",
    "Movie.2020.1080p.x265.mp4",
    "Movie.2020.1080p.H.265.mp4",
    "Movie.2020.1080p.DTS-HD.MA.mp4",
    "Movie.2020.2160p.TrueHD.Atmos.mp4",
    "Movie.2020.1080p.WEB-DL.DDP5.1.H.264.mp4",
    "Movie.2020.1080p.WEB-DL.DD5.1.x264.mp4",
    "Movie.2020.1080p.EAC3.x264.mp4",
    "Movie 2020 1080p AC3 x264.mp4",
  ]) {
    assert.equal(needsWebTranscode(name, CHROME), true, name);
  }
});

test("web playable: a plain H.264/AAC MP4 plays as is", () => {
  assert.equal(needsWebTranscode("Movie.2020.1080p.WEB-DL.AAC2.0.H.264.mp4", CHROME), false);
  assert.equal(needsWebTranscode("Movie.2020.1080p.WEB-DL.AAC2.0.H.264.mp4", SAFARI), false);
  assert.equal(needsWebTranscode("Movie.2020.1080p.x264.webm", CHROME), false);
  // Words that only contain a codec name are not tags.
  assert.equal(needsWebTranscode("Shadows.2020.1080p.x264.mp4", CHROME), false);
  assert.equal(needsWebTranscode("Headstrong.2020.1080p.mp4", CHROME), false);
});

test("web playable: WebKit transcodes anything that isn't MP4, M4V or HLS", () => {
  assert.equal(needsWebTranscode("Movie.2020.1080p.x264.webm", SAFARI), true);
  assert.equal(needsWebTranscode("Movie.2020.ts", SAFARI), true);
  assert.equal(needsWebTranscode("https://host.example/opaque/token", SAFARI), true);
  assert.equal(needsWebTranscode(null, SAFARI), true);
  assert.equal(needsWebTranscode("Movie.2020.m4v", SAFARI), false);
  assert.equal(needsWebTranscode("https://host.example/v/full.m3u8?x=1", SAFARI), false);
  // An unknown name is left alone outside WebKit.
  assert.equal(needsWebTranscode("https://host.example/opaque/token", CHROME), false);
});

test("web playable: the decision Real-Debrid's link is checked against", () => {
  const mkv = "https://x.download.real-debrid.com/d/ABC/Movie.mkv";
  assert.equal(needsWebTranscode(mkv, CHROME), true);
  assert.equal(needsWebTranscode(mkv, SAFARI), true);
  assert.equal(needsWebTranscode(mkv, NATIVE), false);
  assert.equal(needsWebTranscode("Movie.x264.AAC.mp4", CHROME), false);
  // The transcode itself is HLS, which WebKit plays as is.
  const hls = "https://xyz.download.real-debrid.com/t/ABC/eng1/none/aac/full.m3u8";
  assert.equal(needsWebTranscode(hls, SAFARI), false);
  assert.equal(needsWebTranscode(hls, CHROME), false);
});

test("web playable: Real-Debrid transcodes everywhere, TorBox for Safari", () => {
  assert.equal(canWebTranscode("rd", CHROME), true);
  assert.equal(canWebTranscode("rd", SAFARI), true);
  assert.equal(canWebTranscode("tb", SAFARI), true);
  assert.equal(canWebTranscode("tb", CHROME), false);
  assert.equal(canWebTranscode("ad", SAFARI), false);
});

test("web playable: WebKit detection covers iPadOS in desktop mode", () => {
  assert.equal(isWebKitUserAgent(IPAD_SAFARI, 5), true);
  assert.equal(isWebKitUserAgent(IPAD_LEGACY, 5), true);
  assert.equal(isWebKitUserAgent(IPHONE, 5), true);
  assert.equal(isWebKitUserAgent(IPAD_SAFARI, 0), true); // desktop Safari on a Mac
  assert.equal(isWebKitUserAgent(MAC_CHROME, 0), false);
  assert.equal(isWebKitUserAgent(DESKTOP_CHROME, 0), false);
});

test("device label: names the iPad and iPhone, otherwise the browser", () => {
  assert.equal(deviceLabelForUserAgent(IPAD_SAFARI, 5), "This iPad");
  assert.equal(deviceLabelForUserAgent(IPAD_LEGACY, 5), "This iPad");
  assert.equal(deviceLabelForUserAgent(IPHONE, 5), "This iPhone");
  assert.equal(deviceLabelForUserAgent(IPAD_SAFARI, 0), "This browser");
  assert.equal(deviceLabelForUserAgent(DESKTOP_CHROME, 0), "This browser");
});

test("Apple web ranking: MP4 up, non-MP4 down unless Real-Debrid can transcode it", async () => {
  const { appleWebRankDelta } = await import("../src/lib/player/web-playable.ts");
  const ios = { web: true, webkit: true };
  assert.equal(appleWebRankDelta("Movie.2024.1080p.WEB-DL.mp4", ["tb"], ios), 12);
  assert.equal(appleWebRankDelta("Movie.2024.1080p.mkv", ["tb"], ios), 0);
  assert.equal(appleWebRankDelta("Movie.2024.1080p.mkv", ["ad"], ios), -25);
  assert.equal(appleWebRankDelta("Movie.2024.1080p.mkv", ["tb", "rd"], ios), 0);
  assert.equal(appleWebRankDelta("Movie.2024.1080p.mkv", [], { web: true, webkit: false }), 0);
  assert.equal(appleWebRankDelta("Movie.2024.1080p.mkv", [], { web: false, webkit: false }), 0);
});
