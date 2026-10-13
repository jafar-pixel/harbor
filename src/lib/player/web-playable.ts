import { nativePlayback } from "./native-playback";

/**
 * Which debrid files the web build's <video> player can be trusted to play, and when to
 * swap in the provider's transcoded HLS stream instead. The desktop and TV apps play
 * through mpv/ExoPlayer and never take this path.
 */

export type WebPlaybackEnv = {
  /** A browser <video> plays the stream: not the desktop app (mpv) or the TV app (ExoPlayer). */
  web: boolean;
  /** Safari, or any browser on iOS/iPadOS (all of them are WebKit there). */
  webkit: boolean;
};

const NATIVE_ENV: WebPlaybackEnv = { web: false, webkit: false };

// MP4/M4V and HLS are the only containers WebKit plays from a debrid link.
const APPLE_CONTAINER = /\.(mp4|m4v|m3u8)$/;
// No browser plays these containers.
const UNPLAYABLE_CONTAINER = /\.(mkv|avi)$/;
// Release-name codec tags no browser decodes reliably: HEVC, and the cinema/Dolby audio
// formats (DD5.1 and DDP5.1 are how scene names spell AC3 and EAC3).
const UNPLAYABLE_CODEC =
  /(?:^|[^a-z0-9])(?:hevc|x265|h\.?265|dts(?:-?hd|-?x)?|truehd|e-?ac-?3|ac-?3|ddp?\+?\d|dd\+|ddp|atmos)(?=[^a-z0-9]|$)/;

function nameOf(nameOrUrl: string): string {
  let name = nameOrUrl.trim().toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(name)) {
    try {
      name = decodeURIComponent(new URL(name).pathname);
    } catch {
      name = name.split(/[?#]/)[0];
    }
  }
  return name;
}

/** True when the original file likely won't play in this browser and a transcode should be used. */
export function needsWebTranscode(
  nameOrUrl: string | null | undefined,
  env: WebPlaybackEnv,
): boolean {
  if (!env.web) return false;
  const name = nameOf(nameOrUrl ?? "");
  if (env.webkit && !APPLE_CONTAINER.test(name)) return true;
  if (UNPLAYABLE_CONTAINER.test(name)) return true;
  return UNPLAYABLE_CODEC.test(name);
}

/** Debrid providers whose client fills DirectLink.webStreamUrl. */
export function canWebTranscode(slug: string): boolean {
  return slug === "rd";
}

export function isWebKitUserAgent(ua: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS asks for the desktop site by default and then reports itself as a Mac.
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return true;
  return (
    /AppleWebKit/.test(ua) &&
    /Safari/.test(ua) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android/.test(ua)
  );
}

export function currentWebPlaybackEnv(): WebPlaybackEnv {
  if (typeof window === "undefined" || nativePlayback()) return NATIVE_ENV;
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    web: true,
    webkit: isWebKitUserAgent(nav?.userAgent ?? "", nav?.maxTouchPoints ?? 0),
  };
}
