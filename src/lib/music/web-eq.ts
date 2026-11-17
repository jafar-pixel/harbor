import { MUSIC_EQ_FREQUENCIES, type MusicAudioSettingsValue } from "./audio-settings";

/**
 * The music EQ in the website and phone player (the Windows app has its own, natively). It shapes
 * songs the page can process: the viewer's files, Jellyfin and direct links. YouTube and Spotify
 * play inside their own sealed players, which no page or app can process. Plain module, no audio.
 */

export type WebEqFilter = {
  type: "peaking" | "lowshelf" | "highshelf" | "lowpass" | "highpass" | "notch";
  frequency: number;
  gain: number;
  q: number;
};
export type WebEqPlan = { filters: WebEqFilter[]; preampDb: number };

const PEQ_TYPE: Record<string, WebEqFilter["type"]> = {
  peak: "peaking",
  lowShelf: "lowshelf",
  highShelf: "highshelf",
  lowPass: "lowpass",
  highPass: "highpass",
  notch: "notch",
};

/** Graphic bands one octave apart: this Q keeps neighbouring bands from piling up. */
const GRAPHIC_Q = 1.41;

/** The filters for the current settings, or null when the EQ is off. */
export function webEqPlan(s: MusicAudioSettingsValue): WebEqPlan | null {
  if (!s.eqEnabled || s.dspBypass) return null;
  const strength = Number.isFinite(s.eqStrength) ? s.eqStrength : 1;
  const filters: WebEqFilter[] =
    s.eqMode === "parametric"
      ? s.peqFilters
          .filter((f) => f.enabled)
          .map((f) => ({
            type: PEQ_TYPE[f.type] ?? "peaking",
            frequency: f.frequency,
            gain: f.gain * strength,
            q: f.q,
          }))
      : MUSIC_EQ_FREQUENCIES.map((frequency, i) => ({
          type: "peaking" as const,
          frequency,
          gain: (s.eqBands[i] ?? 0) * strength,
          q: GRAPHIC_Q,
        }));
  // Boosts can push loud songs past full scale; with auto headroom the whole signal is lowered by
  // the biggest boost so they never distort.
  const boost = Math.max(0, ...filters.filter((f) => gains(f.type)).map((f) => f.gain));
  const preampDb = s.preampDb - (s.autoHeadroom ? boost : 0);
  return { filters, preampDb };
}

/** Filter types whose gain changes the level (pass and notch filters have none). */
function gains(type: WebEqFilter["type"]): boolean {
  return type === "peaking" || type === "lowshelf" || type === "highshelf";
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Whether a song's address lets the page process its sound. A browser plays any address, but
 * processing one from another site needs that site's permission (CORS); without it the sound
 * would come out silent, so such songs play without the EQ instead.
 */
export function sameOriginMedia(url: string, origin: string): boolean | null {
  if (url.startsWith("blob:") || url.startsWith("data:")) return true;
  try {
    return new URL(url, origin).origin === origin ? true : null;
  } catch {
    return false;
  }
}
