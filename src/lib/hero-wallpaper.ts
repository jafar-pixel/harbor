import { useEffect, useState } from "react";
import { artworkPixels, musicArtworkColor } from "@/lib/music/appearance";

function rgbToHsl([r, g, b]: number[]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === rn ? ((gn - bn) / d + 6) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): number[] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

/**
 * The page tint for a hero's art: its dominant vivid colour (the music player's pick), held to a
 * mid lightness so it glows on a dark page without washing out text, and to a saturation band so
 * a muddy pick still reads as a colour. Near-grey art stays grey rather than inventing a hue.
 */
export function wallpaperTint(pixels: ArrayLike<number>): string | null {
  const picked = musicArtworkColor(pixels);
  const rgb = picked?.color.match(/\d+/g)?.map(Number);
  if (!rgb || rgb.length < 3) return null;
  const [h, s, l] = rgbToHsl(rgb);
  const sat = s < 0.08 ? s : Math.min(0.82, Math.max(0.38, s));
  const light = Math.min(0.58, Math.max(0.4, l));
  return `rgb(${hslToRgb(h, sat, light).join(" ")})`;
}

const MAX_CACHED = 120;
const tints = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

/** Samples a picture once per URL for the session; a picture that cannot be read answers null. */
export function heroWallpaperTint(src: string): Promise<string | null> {
  if (tints.has(src)) return Promise.resolve(tints.get(src) ?? null);
  const known = pending.get(src);
  if (known) return known;
  const job = artworkPixels(src)
    .then((pixels) => (pixels ? wallpaperTint(pixels) : null))
    .catch(() => null)
    .then((tint) => {
      tints.set(src, tint);
      pending.delete(src);
      while (tints.size > MAX_CACHED) tints.delete(tints.keys().next().value!);
      return tint;
    });
  pending.set(src, job);
  return job;
}

/** The tint for `src` once sampled (null tint when it could not be), or null while pending. */
export function useHeroWallpaperTint(
  src: string | null,
): { src: string; tint: string | null } | null {
  const [result, setResult] = useState<{ src: string; tint: string | null } | null>(() =>
    src && tints.has(src) ? { src, tint: tints.get(src) ?? null } : null,
  );
  useEffect(() => {
    if (!src) return;
    let alive = true;
    void heroWallpaperTint(src).then((tint) => {
      if (alive) setResult({ src, tint });
    });
    return () => {
      alive = false;
    };
  }, [src]);
  return result && result.src === src ? result : null;
}
