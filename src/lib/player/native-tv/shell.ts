import type { PassthroughAudio } from "@/lib/streams/scoring/scoring-types";

/**
 * The Android TV app's `window.JLNativePlayer` (android-tv/README.md): whether it is here, what
 * the TV says it can do, and the playback options sent with every play. Kept apart from the
 * player bridge so stream ranking and settings can read it without loading the player.
 */

export type NativeTvPlayer = {
  isAvailable(): boolean;
  play(url: string, headersJson: string, title: string, startMs: number): boolean;
  setMode(mode: "full" | "hero" | "hidden"): void;
  setRect(x: number, y: number, w: number, h: number): void;
  pause(): void;
  resume(): void;
  seek(ms: number): void;
  stop(): void;
  /** The player's own volume, 0 to 1; absent from app builds before the small TV's volume. */
  setVolume?(volume: number): void;
  /** A line about the page for the TV app's crash report; absent from older app builds. */
  notePage?(text: string): void;
  /** Absent from app builds before the TV playback options. */
  setOptions?(json: string): void;
  /** Absent from app builds before the TV playback options. */
  capabilities?(): string;
  /** The audio tracks of the playing stream as JSON ([NativeAudioTrack]); absent from older app builds. */
  audioTracks?(): string;
  /** Prefers audio in this language (ISO 639 code); absent from older app builds. */
  setPreferredAudioLanguage?(lang: string): void;
  /** A short message over the full-screen video, ignored outside full screen; absent from older app builds. */
  showMessage?(text: string): void;
  /** A subtitle as WebVTT text, added to the playing video; absent from older app builds. */
  addSubtitleText?(vtt: string, language: string, label: string, select: boolean): boolean;
  /** Subtitles on or off; absent from older app builds. */
  setSubtitlesEnabled?(on: boolean): void;
  /** Subtitle timing in seconds, positive for later; absent from older app builds. */
  setSubtitleDelay?(sec: number): void;
  /**
   * The skip button over the video, as JSON {label, toSec} or {label, action: "next"}; an empty
   * string hides it. Absent from older app builds.
   */
  setSkipButton?(json: string): void;
  /** Audio timing in seconds, positive for later; absent from older app builds. */
  setAudioDelay?(sec: number): void;
};

/** One entry of `audioTracks()` and of the `tracks` event (android-tv/README.md). */
export type NativeAudioTrack = {
  id: string;
  language?: string;
  label?: string;
  selected?: boolean;
  channels?: number;
  codec?: string;
};

export type NativeTvMaxResolution = "auto" | "1080p" | "720p";

export type NativeTvOptions = {
  matchFrameRate: boolean;
  maxResolution: NativeTvMaxResolution;
  audioPassthrough: boolean;
  tunneling: boolean;
  /** Identify song on the full-screen bar, with the viewer's own service and key. */
  songId: { enabled: boolean; provider: "audd" | "ai"; key: string; model: string };
  /** The bar's buttons in the viewer's order (Settings › Player layout); app builds without it keep their row. */
  controls?: string[];
  /** The theme's accent colour (#rrggbb), for the seek bar and highlights. */
  accent?: string;
  /** The title and the stream's labels, shown across the top with the bar. */
  info?: string;
  /** Settings › Subtitles: size in px at 1080p, colours, and "shadow", "outline" or "box". */
  subtitles?: {
    size: number;
    color: string;
    edgeColor: string;
    style: "shadow" | "outline" | "box";
    boxColor: string;
    boxOpacity: number;
  };
  /** Settings › Intros: what skips by itself, and whether the skip button shows. */
  skip?: { intro: boolean; recap: boolean; outro: boolean; button: boolean };
};

export type NativeTvCapabilities = {
  maxWidth: number;
  maxHeight: number;
  refreshRates: number[];
  /** "hdr10", "hdr10-plus", "hlg", "dolby-vision". */
  hdr: string[];
  /** Encodings the TV can send undecoded: "ac3", "eac3", "eac3-joc", "ac4", "dts", "dts-hd", "truehd". */
  passthrough: string[];
  /** The app hands Back to the page's Big Picture before walking WebView history. */
  pageBack: boolean;
};

export function nativeTvPlayer(): NativeTvPlayer | null {
  if (typeof window === "undefined") return null;
  const p = (window as unknown as { JLNativePlayer?: NativeTvPlayer }).JLNativePlayer;
  try {
    return p && p.isAvailable() ? p : null;
  } catch {
    return null;
  }
}

/**
 * The `english-dub` event: the "English dub" item of the app's full-screen menu, sent when the
 * file has no English track, asks the page to find an English dub source.
 */
export function isNativeEnglishDubRequest(detail: unknown): boolean {
  return (
    typeof detail === "object" &&
    detail !== null &&
    (detail as { type?: unknown }).type === "english-dub"
  );
}

/** Shows a message over the app's full-screen video, where the page's own notices are hidden. */
export function showNativeTvMessage(text: string): void {
  const p = nativeTvPlayer();
  if (!p || typeof p.showMessage !== "function") return;
  try {
    p.showMessage(text);
  } catch {
    /* An app build without the message overlay shows nothing. */
  }
}

/** True inside the JL Media Vision TV app on one of its own pages. */
export function nativeTvAvailable(): boolean {
  return nativeTvPlayer() !== null;
}

function numbers(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === "number" && n > 0) : [];
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

export function parseNativeTvCapabilities(raw: unknown): NativeTvCapabilities | null {
  let o: unknown = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object") return null;
  const c = o as Record<string, unknown>;
  const size = (v: unknown) => (typeof v === "number" && v > 0 ? Math.round(v) : 0);
  return {
    maxWidth: size(c.maxWidth),
    maxHeight: size(c.maxHeight),
    refreshRates: [...new Set(numbers(c.refreshRates))].sort((a, b) => a - b),
    hdr: strings(c.hdr),
    passthrough: strings(c.passthrough),
    pageBack: c.pageBack === true,
  };
}

/** What the TV reports, or null outside the TV app or on an app build without `capabilities()`. */
export function nativeTvCapabilities(): NativeTvCapabilities | null {
  const p = nativeTvPlayer();
  if (!p || typeof p.capabilities !== "function") return null;
  try {
    return parseNativeTvCapabilities(p.capabilities());
  } catch {
    return null;
  }
}

export function nativeTvOptions(s: {
  tvMatchFrameRate: boolean;
  tvMaxResolution: NativeTvMaxResolution;
  tvAudioPassthrough: boolean;
  tvTunneling: boolean;
  songIdEnabled: boolean;
  songIdProvider: "audd" | "ai";
  auddKey?: string;
  songIdAiKey?: string;
  songIdAiModel?: string;
  subFontSize?: number;
  subFontColor?: string;
  subBorderColor?: string;
  subStyle?: "shadow" | "outline" | "box";
  subBoxColor?: string;
  subBoxOpacity?: number;
  autoSkipIntro?: boolean;
  autoSkipRecap?: boolean;
  autoSkipOutro?: boolean;
  showSkipButton?: boolean;
}): NativeTvOptions {
  const ai = s.songIdProvider === "ai";
  return {
    matchFrameRate: s.tvMatchFrameRate,
    maxResolution: s.tvMaxResolution,
    audioPassthrough: s.tvAudioPassthrough,
    tunneling: s.tvTunneling,
    songId: {
      enabled: s.songIdEnabled,
      provider: s.songIdProvider,
      key: ((ai ? s.songIdAiKey : s.auddKey) ?? "").trim(),
      model: (s.songIdAiModel ?? "").trim(),
    },
    subtitles: {
      size: s.subFontSize ?? 32,
      color: s.subFontColor ?? "#FFFFFF",
      edgeColor: s.subBorderColor ?? "#000000",
      style: s.subStyle ?? "shadow",
      boxColor: s.subBoxColor ?? "#000000",
      boxOpacity: s.subBoxOpacity ?? 0.6,
    },
    skip: {
      intro: s.autoSkipIntro === true,
      recap: s.autoSkipRecap === true,
      outro: s.autoSkipOutro === true,
      button: s.showSkipButton !== false,
    },
  };
}

/**
 * The DTS and TrueHD tracks the TV can play. ExoPlayer has no decoder for either, so they only
 * play when the receiver takes them as passthrough. Undefined when the app does not report its
 * audio outputs (an older app build): ranking then keeps its general penalty for these codecs.
 */
export function tvPassthroughAudio(
  enabled: boolean,
  caps: NativeTvCapabilities | null,
): PassthroughAudio[] | undefined {
  if (!enabled) return [];
  if (!caps) return undefined;
  const out: PassthroughAudio[] = [];
  if (caps.passthrough.includes("dts") || caps.passthrough.includes("dts-hd")) out.push("DTS");
  if (caps.passthrough.includes("truehd")) out.push("TrueHD");
  return out;
}

const HDR_NAMES: [string, string][] = [
  ["hdr10", "HDR10"],
  ["hdr10-plus", "HDR10+"],
  ["hlg", "HLG"],
  ["dolby-vision", "Dolby Vision"],
];

const AUDIO_NAMES: [string, string][] = [
  ["ac3", "Dolby Digital"],
  ["eac3", "Dolby Digital Plus"],
  ["eac3-joc", "Dolby Atmos"],
  ["ac4", "AC-4"],
  ["truehd", "Dolby TrueHD"],
  ["dts", "DTS"],
  ["dts-hd", "DTS-HD"],
];

function resolutionName(height: number): string {
  if (height >= 2160) return "4K";
  return height > 0 ? `${height}p` : "";
}

function hz(rate: number): string {
  return String(Math.round(rate * 1000) / 1000);
}

/** One line for the settings page, e.g. "4K · HDR10, Dolby Vision · 23.976–60 Hz · DTS passthrough". */
export function describeNativeTvCapabilities(caps: NativeTvCapabilities): string {
  const parts: string[] = [];
  const res = resolutionName(Math.min(caps.maxWidth, caps.maxHeight));
  if (res) parts.push(res);
  const hdr = HDR_NAMES.filter(([id]) => caps.hdr.includes(id)).map(([, name]) => name);
  parts.push(hdr.length > 0 ? hdr.join(", ") : "SDR");
  const rates = caps.refreshRates;
  if (rates.length === 1) parts.push(`${hz(rates[0])} Hz`);
  else if (rates.length > 1) parts.push(`${hz(rates[0])}–${hz(rates[rates.length - 1])} Hz`);
  const audio = AUDIO_NAMES.filter(([id]) => caps.passthrough.includes(id)).map(([, name]) => name);
  parts.push(audio.length > 0 ? `${audio.join(", ")} passthrough` : "No audio passthrough");
  return parts.join(" · ");
}
