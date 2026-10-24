import type { TrackInfo } from "./bridge";
import { hasCachedMarker, hasUncachedMarker } from "@/lib/streams/cached";
import { parseLanguages } from "@/lib/streams/parser/parser-language";

/**
 * The "English dub" player control: whether the audio playing is English, which track to switch
 * to when the file has one, and which other sources to try when it doesn't.
 */

const ENGLISH_CODES = new Set(["en", "eng", "english"]);
const ENGLISH_WORD = /\benglish\b/i;
// Commentary and audio description tracks are English too, but never the dub the viewer wants.
const SECONDARY_AUDIO = /comment|descri|\bAD\b|narrat/i;

/** "en", "eng", "English", "en-US", "en_GB". */
export function isEnglishLanguage(lang: string | null | undefined): boolean {
  if (!lang) return false;
  const base = lang.trim().toLowerCase().split(/[-_]/)[0];
  return ENGLISH_CODES.has(base);
}

export function isEnglishTrack(track: Pick<TrackInfo, "lang" | "title" | "label">): boolean {
  if (isEnglishLanguage(track.lang)) return true;
  return ENGLISH_WORD.test(track.title ?? "") || ENGLISH_WORD.test(track.label ?? "");
}

function trackText(track: Pick<TrackInfo, "title" | "label">): string {
  return `${track.title ?? ""} ${track.label ?? ""}`;
}

/** The English track to switch to: the main mix before commentary, then the default, then the most channels. */
export function findEnglishTrack<T extends TrackInfo>(tracks: readonly T[]): T | null {
  const english = tracks.filter((t) => t.kind === "audio" && isEnglishTrack(t));
  if (english.length === 0) return null;
  const rank = (t: T) =>
    (SECONDARY_AUDIO.test(trackText(t)) ? 0 : 1000) + (t.default ? 100 : 0) + (t.channelCount ?? 0);
  return english.slice().sort((a, b) => rank(b) - rank(a))[0];
}

/**
 * - english:   the selected track is English.
 * - available: the file has an English track that isn't selected.
 * - missing:   the file reports its tracks and none is English.
 * - unknown:   the player can't list the tracks (a plain web <video>); the stream's
 *              own language tags decide in the caller.
 */
export type EnglishAudioState = "english" | "available" | "missing" | "unknown";

export function englishAudioState(tracks: readonly TrackInfo[]): EnglishAudioState {
  const audio = tracks.filter((t) => t.kind === "audio");
  if (audio.length === 0) return "unknown";
  const selected = audio.find((t) => t.selected);
  if (selected && isEnglishTrack(selected)) return "english";
  return audio.some(isEnglishTrack) ? "available" : "missing";
}

// Countries whose films are made in English, for titles whose metadata has no original language.
const ENGLISH_COUNTRIES = new Set([
  "us",
  "usa",
  "united states",
  "united states of america",
  "gb",
  "uk",
  "united kingdom",
  "ca",
  "canada",
  "au",
  "australia",
  "ie",
  "ireland",
  "nz",
  "new zealand",
]);

/**
 * Whether a title's own audio isn't English, so the viewer needs an English dub: its original
 * language when the metadata has one (TMDB), else its first listed country (Cinemeta). Anime
 * keeps its Japanese audio, and a title with neither field is left alone.
 */
export function needsEnglishDub(meta: {
  type?: string;
  originalLanguage?: string;
  country?: string;
  genres?: string[];
}): boolean {
  if (meta.type === "anime" || (meta.genres ?? []).some((g) => g.toLowerCase() === "anime")) {
    return false;
  }
  const lang = (meta.originalLanguage ?? "").trim();
  if (lang) return !isEnglishLanguage(lang);
  const country = (meta.country ?? "").split(",")[0].trim().toLowerCase();
  if (country) return !ENGLISH_COUNTRIES.has(country);
  return false;
}

/** Language tags parsed from the playing stream's addon title or filename, for when tracks are unknown. */
export function streamTextIsEnglish(text: string | null | undefined): boolean {
  return parseLanguages(text ?? "").includes("English");
}

type DubCandidate = {
  audioLanguages: string[];
  url?: string | null;
  infoHash?: string | null;
  fileIdx?: number | null;
  addonId?: string | null;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  cached: Partial<Record<string, boolean>>;
  inLibrary: Partial<Record<string, boolean>>;
};

/**
 * English named outright ranks above a bare multi-audio tag, which usually but not always
 * includes English. A stream with no language tags is left out: it is most likely the same
 * original-language release the viewer is trying to get away from.
 */
export function englishDubRank(s: Pick<DubCandidate, "audioLanguages">): number {
  if (s.audioLanguages.includes("English")) return 2;
  if (s.audioLanguages.includes("Multi")) return 1;
  return 0;
}

/** The picker's notion of "cached": a direct link, a debrid cache or library hit, or the addon's marker. */
export function isCachedStream(s: DubCandidate, debridSlugs: readonly string[]): boolean {
  if (s.url != null && !s.infoHash && !hasUncachedMarker(s)) return true;
  if (debridSlugs.some((slug) => s.cached[slug] === true || s.inLibrary[slug] === true))
    return true;
  return hasCachedMarker(s);
}

export function dubStreamKey(
  s: Pick<DubCandidate, "infoHash" | "url" | "addonId" | "title" | "fileIdx">,
): string {
  if (s.infoHash) return `${s.infoHash.toLowerCase()}:${s.fileIdx ?? ""}`;
  return s.url ?? `${s.addonId ?? ""}:${s.title ?? ""}`;
}

/**
 * Sources to try for an English dub, best first: cached before uncached, English named before
 * multi-audio, then the pipeline's own order. `exclude` drops the playing stream and any
 * already tried.
 */
export function rankEnglishDubStreams<S extends DubCandidate>(
  streams: readonly S[],
  opts: { debridSlugs: readonly string[]; exclude: (s: S) => boolean },
): S[] {
  return streams
    .map((s, i) => ({ s, i, rank: englishDubRank(s) }))
    .filter((x) => x.rank > 0 && !opts.exclude(x.s))
    .map((x) => ({ ...x, cached: isCachedStream(x.s, opts.debridSlugs) ? 1 : 0 }))
    .sort((a, b) => b.cached - a.cached || b.rank - a.rank || a.i - b.i)
    .map((x) => x.s);
}
