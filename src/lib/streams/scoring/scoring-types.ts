import type { DebridSlug, Tier } from "../types";

/** Audio the Android TV app can only play by passing it to the receiver undecoded. */
export type PassthroughAudio = "DTS" | "TrueHD";

export type ScoreOptions = {
  activeDebrids: DebridSlug[];
  preferredLanguages?: string[];
  bandwidthMbps?: number;
  releaseDate?: string | null;
  mediaKind?: "movie" | "series";
  runtimeMinutes?: number;
  inTheaters?: boolean;
  preferSingleAudioTrack?: boolean;
  /** The title's own audio isn't English: rank English-dub sources first (Settings → Audio). */
  preferEnglishDub?: boolean;
  /**
   * Set only in the Android TV app: which of DTS and TrueHD the receiver takes as passthrough.
   * Undefined keeps the general playability penalty.
   */
  tvPassthroughAudio?: PassthroughAudio[];
  preferAddonId?: string;
  preferredReleaseGroup?: string;
  respectAddonOrder?: boolean;
  /** The browser this plays in, when it is the web build (see player/web-playable). */
  webPlayback?: import("@/lib/player/web-playable").WebPlaybackEnv;
};

export type CorpusStats = {
  daysSinceRelease: number | null;
  trustedTrackedFraction: number;
  theaterCaptureFraction: number;
  webishFraction: number;
  trustedTrackedCount: number;
};

export const TRACKING_MIN_SEEDERS = 30;

export const TIER_ORDER: Tier[] = [
  "4K_DV",
  "4K_HDR",
  "4K",
  "1080p_HDR",
  "1080p",
  "720p",
  "SD",
  "ROUGH",
];
