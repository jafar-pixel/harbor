/**
 * The CSS width a television lays the app out at, chosen in settings. index.html reads the same
 * key in an inline script before the bundle boots and writes it into the viewport tag; changing
 * the viewport on a live page breaks focus movement in Android TV WebViews, so a new size applies
 * by reloading.
 */

export const TV_CANVAS_KEY = "jl.tv.canvas";
export const TV_CANVAS_SIZES = [1140, 1366, 1600, 1920] as const;
export type TvCanvas = (typeof TV_CANVAS_SIZES)[number];
/** Keep in step with the default in index.html's inline script. */
export const DEFAULT_TV_CANVAS: TvCanvas = 1366;

export function parseTvCanvas(raw: string | null): TvCanvas {
  const n = Number(raw);
  return (TV_CANVAS_SIZES as readonly number[]).includes(n) ? (n as TvCanvas) : DEFAULT_TV_CANVAS;
}

export function readTvCanvas(): TvCanvas {
  try {
    return parseTvCanvas(localStorage.getItem(TV_CANVAS_KEY));
  } catch {
    return DEFAULT_TV_CANVAS;
  }
}

export function setTvCanvas(size: TvCanvas): void {
  if (size === readTvCanvas()) return;
  try {
    localStorage.setItem(TV_CANVAS_KEY, String(size));
  } catch {
    return;
  }
  window.location.reload();
}
