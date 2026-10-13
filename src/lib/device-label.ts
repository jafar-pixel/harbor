import { nativePlayback } from "@/lib/player/native-playback";

/** What the app calls the device it is running on, for "Playing on …" labels. */
export function deviceLabelForUserAgent(ua: string, maxTouchPoints = 0): string {
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return "This iPad";
  if (/iPhone|iPod/.test(ua)) return "This iPhone";
  return "This browser";
}

/** "This PC" in the desktop and TV apps; the browser build names the device it runs on instead. */
export function localDeviceLabel(): string {
  if (typeof window === "undefined" || nativePlayback()) return "This PC";
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return deviceLabelForUserAgent(nav?.userAgent ?? "", nav?.maxTouchPoints ?? 0);
}
