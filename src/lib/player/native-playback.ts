import { nativeTvAvailable } from "./native-tv/shell";

/**
 * Streams play in a native player rather than a browser <video>: mpv in the desktop app, or
 * ExoPlayer in the Android TV app. Both handle HEVC, 10-bit, HDR, MKV and multi-track files, so
 * stream ranking must not apply the browser's compatibility preferences there.
 */
export function nativePlayback(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || nativeTvAvailable();
}

/** The picked stream is decoded by a browser <video>, which plays one audio track only. */
export function browserDecodes(playerEngine: string): boolean {
  if (!nativePlayback()) return true;
  return playerEngine === "html5" && !nativeTvAvailable();
}
