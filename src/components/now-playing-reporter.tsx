import { useNowPlayingReporter } from "@/lib/music/now-playing-sync";

/** Keeps this device's "now playing" row current for the listener's other devices. */
export function NowPlayingReporter() {
  useNowPlayingReporter();
  return null;
}
