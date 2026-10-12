import assert from "node:assert/strict";
import test from "node:test";
import { wallpaperTint } from "../src/lib/hero-wallpaper.ts";

const channels = (value: string | null) => value?.match(/\d+/g)?.map(Number) ?? [];

function lightness(rgb: number[]): number {
  return (Math.max(...rgb) + Math.min(...rgb)) / 2 / 255;
}

test("wallpaper tint answers null for art with no usable pixels", () => {
  assert.equal(wallpaperTint([]), null);
  // Near-black and near-white pixels carry no colour to pick.
  assert.equal(wallpaperTint([4, 4, 4, 255, 250, 250, 250, 255]), null);
});

test("wallpaper tint lifts a dark dominant colour to a readable mid lightness", () => {
  const rgb = channels(wallpaperTint([90, 12, 12, 255, 92, 10, 14, 255]));
  assert.equal(rgb.length, 3);
  assert.ok(rgb[0] > rgb[1] && rgb[0] > rgb[2], "keeps the red hue");
  assert.ok(lightness(rgb) >= 0.39 && lightness(rgb) <= 0.59);
});

test("wallpaper tint calms a neon pick so text stays readable", () => {
  const rgb = channels(wallpaperTint([255, 240, 40, 255]));
  assert.ok(lightness(rgb) <= 0.59);
  assert.ok(rgb[0] > rgb[2] && rgb[1] > rgb[2], "keeps the yellow hue");
});

test("wallpaper tint prefers the vivid colour over a larger grey area", () => {
  const pixels: number[] = [];
  for (let i = 0; i < 6; i++) pixels.push(120, 120, 120, 255);
  for (let i = 0; i < 4; i++) pixels.push(20, 90, 200, 255);
  const rgb = channels(wallpaperTint(pixels));
  assert.ok(rgb[2] > rgb[0] && rgb[2] > rgb[1], "picks the blue");
});

test("wallpaper tint keeps grey art grey instead of inventing a hue", () => {
  const rgb = channels(wallpaperTint([128, 128, 130, 255]));
  assert.ok(Math.max(...rgb) - Math.min(...rgb) <= 8);
});
