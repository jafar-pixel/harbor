import assert from "node:assert/strict";
import test from "node:test";
import {
  autoFloorBitrate,
  levelForHeight,
  qualityLabel,
  renditionHeights,
} from "../src/lib/player/html5/hls-quality.ts";

const ladder = [
  { height: 360, bitrate: 800_000 },
  { height: 480, bitrate: 1_400_000 },
  { height: 720, bitrate: 3_000_000 },
  { height: 1080, bitrate: 6_000_000 },
  { height: 2160, bitrate: 16_000_000 },
];

test("rendition heights are distinct and highest first", () => {
  assert.deepEqual(
    renditionHeights([
      ...ladder,
      { height: 720, bitrate: 2_000_000 },
      { height: 0, bitrate: 64_000 },
    ]),
    [2160, 1080, 720, 480, 360],
  );
});

test("a chosen height holds the best rendition at or under it", () => {
  assert.equal(levelForHeight(ladder, 2160), 4);
  assert.equal(levelForHeight(ladder, 1080), 3);
  assert.equal(levelForHeight([...ladder, { height: 1080, bitrate: 8_000_000 }], 1080), 5);
  assert.equal(levelForHeight(ladder, 200), 0);
});

test("auto never drops below 720p while 720p or sharper exists", () => {
  assert.equal(autoFloorBitrate(ladder), 3_000_000);
  assert.equal(autoFloorBitrate(ladder.slice(0, 2)), 0);
});

test("4K renditions are labelled 4K", () => {
  assert.equal(qualityLabel(2160), "4K");
  assert.equal(qualityLabel(1080), "1080p");
});
