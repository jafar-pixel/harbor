import { nativeTvCapabilities } from "@/lib/player/native-tv/shell";

/**
 * The tallest picture this screen shows: 2160 on a 4K TV, 1080 on a full-HD one. The TV app
 * reports its display modes; elsewhere the screen's own size (in device pixels) is used.
 */
export function deviceMaxHeight(): number {
  const tv = nativeTvCapabilities();
  if (tv?.maxHeight) return tv.maxHeight;
  if (typeof window === "undefined" || !window.screen) return 1080;
  const dpr = window.devicePixelRatio || 1;
  return Math.round(Math.min(window.screen.width, window.screen.height) * dpr);
}
