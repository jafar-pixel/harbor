import { parse } from "parse-torrent-title";
import type { DebridSlug, LibraryEntry, LibraryFile } from "./types";

export type LibraryKind = "movie" | "show" | "other";
export type LibraryKindFilter = LibraryKind | "all";
export type LibraryProviderFilter = DebridSlug | "all";

export type LibraryRow = {
  /** Unique across providers: the same hash can sit in RD and TB at once. */
  key: string;
  entry: LibraryEntry;
  kind: LibraryKind;
  title: string;
  year: number | null;
  season: number | null;
  episode: number | null;
  /** Lower-cased title and name, with dots and underscores read as spaces. */
  haystack: string;
};

export type LibraryQuery = {
  search: string;
  kind: LibraryKindFilter;
  provider: LibraryProviderFilter;
};

export type LibraryPage = {
  rows: LibraryRow[];
  /** 1-based, clamped to the available pages. */
  page: number;
  pages: number;
  total: number;
};

export const LIBRARY_PAGE_SIZE = 100;

export type LibraryFileChoice = { file: LibraryFile; fileIdx: number };

const VIDEO_EXT_RE = /\.(mkv|mp4|avi|mov|m4v|webm|ts|m2ts|wmv|mpg|mpeg|flv|ogv)$/i;
const OTHER_EXT_RE =
  /\.(iso|zip|rar|7z|exe|msi|dmg|pkg|apk|bin|img|epub|pdf|cbz|cbr|mobi|azw3|flac|mp3|m4a|aac|ogg|opus|wav)$/i;
const SHOW_RE =
  /\bS\d{1,2}(?:[ ._-]?E\d{1,4})?\b|\b\d{1,2}x\d{2,3}\b|\bseasons?[ ._-]*\d{1,2}\b|\bcomplete[ ._-]+series\b|\bminiseries\b/i;
// Fansub episode releases: "[Group] Title - 12 (1080p)".
const ANIME_EPISODE_RE = /^\[[^\]]+\][^[]*?\s-\s\d{1,4}(?:v\d)?\b/;
const AUDIO_ONLY_RE = /\b(flac|mp3|aac|alac|discography|album|ost|soundtrack)\b/i;
const SOFTWARE_RE =
  /\b(x64|x86|amd64|win(?:dows)?|macos|linux|crack|keygen|portable|repack[ ._-]by)\b/i;

export function isVideoName(name: string): boolean {
  return VIDEO_EXT_RE.test(name);
}

function cleanTitle(raw: string | undefined, fallback: string): string {
  const base = (raw ?? "").replace(/^\[[^\]]+\]\s*/, "").trim();
  return (
    base ||
    fallback
      .replace(/\.[a-z0-9]{2,4}$/i, "")
      .replace(/[._]+/g, " ")
      .trim()
  );
}

export function classifyEntry(entry: Pick<LibraryEntry, "name" | "files">): {
  kind: LibraryKind;
  title: string;
  year: number | null;
  season: number | null;
  episode: number | null;
} {
  const name = entry.name;
  const ptt = parse(name);
  const title = cleanTitle(ptt.title, name);
  const year = ptt.year ?? null;
  const season = ptt.season ?? null;
  const episode = ptt.episode ?? null;
  const files = entry.files ?? [];
  const videos = files.filter((f) => isVideoName(f.name));
  const result = (kind: LibraryKind) => ({ kind, title, year, season, episode });

  if (files.length > 0 && videos.length === 0) return result("other");
  if (OTHER_EXT_RE.test(name)) return result("other");
  if (season != null || episode != null || SHOW_RE.test(name) || ANIME_EPISODE_RE.test(name)) {
    return result("show");
  }
  if (videos.filter((f) => SHOW_RE.test(f.name)).length >= 2) return result("show");
  const hasVideoMarkers = !!(ptt.resolution || ptt.source || ptt.codec) || isVideoName(name);
  if (!hasVideoMarkers && AUDIO_ONLY_RE.test(name)) return result("other");
  if (!hasVideoMarkers && SOFTWARE_RE.test(name)) return result("other");
  if (hasVideoMarkers || (year != null && videos.length > 0)) return result("movie");
  return result("other");
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[._]+/g, " ");
}

export function buildLibraryRows(entries: LibraryEntry[]): LibraryRow[] {
  const rows = entries.map((entry): LibraryRow => {
    const c = classifyEntry(entry);
    return {
      key: `${entry.slug}:${entry.id}`,
      entry,
      ...c,
      haystack: normalize(`${c.title} ${entry.name}`),
    };
  });
  return sortNewestFirst(rows);
}

/** Newest first when an added date is known; entries without one keep their order at the end. */
export function sortNewestFirst(rows: LibraryRow[]): LibraryRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ta = a.row.entry.added;
      const tb = b.row.entry.added;
      if (ta != null && tb != null && ta !== tb) return tb - ta;
      if (ta != null && tb == null) return -1;
      if (ta == null && tb != null) return 1;
      return a.index - b.index;
    })
    .map((x) => x.row);
}

/**
 * Plain text matches as a case-insensitive substring. Text written as /pattern/flags is a
 * regular expression; an invalid pattern falls back to a substring match of the raw text.
 */
export function searchMatcher(search: string): (row: LibraryRow) => boolean {
  const q = search.trim();
  if (!q) return () => true;
  const re = q.match(/^\/(.+)\/([a-z]*)$/);
  if (re) {
    try {
      const flags = re[2].includes("i") ? re[2] : `${re[2]}i`;
      const rx = new RegExp(re[1], flags.replace(/[gy]/g, ""));
      return (row) => rx.test(row.entry.name) || rx.test(row.title);
    } catch {
      // Fall through to a plain match.
    }
  }
  const needle = normalize(q);
  return (row) => row.haystack.includes(needle);
}

export function filterLibraryRows(rows: LibraryRow[], query: LibraryQuery): LibraryRow[] {
  const matches = searchMatcher(query.search);
  return rows.filter(
    (row) =>
      (query.provider === "all" || row.entry.slug === query.provider) &&
      (query.kind === "all" || row.kind === query.kind) &&
      matches(row),
  );
}

export function countLibraryKinds(rows: LibraryRow[]): Record<LibraryKindFilter, number> {
  const out: Record<LibraryKindFilter, number> = { all: rows.length, movie: 0, show: 0, other: 0 };
  for (const row of rows) out[row.kind] += 1;
  return out;
}

export function pageLibraryRows(
  rows: LibraryRow[],
  page: number,
  size = LIBRARY_PAGE_SIZE,
): LibraryPage {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  return { rows: rows.slice(start, start + size), page: current, pages, total: rows.length };
}

/**
 * The files worth listing under an expanded torrent, each with the fileIdx its client expects.
 * Video files only when the torrent has any, so samples of .nfo and .txt stay hidden.
 */
export function libraryFileChoices(files: LibraryFile[]): LibraryFileChoice[] {
  const all = files.map((file, index) => ({ file, fileIdx: file.fileIdx ?? index }));
  const videos = all.filter((c) => isVideoName(c.file.name));
  const pool = videos.length > 0 ? videos : all;
  return pool.sort((a, b) =>
    a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: "base" }),
  );
}

/** Synthetic meta id for playback and downloads. It never matches a cloud-synced id scheme. */
export function debridMetaId(entry: Pick<LibraryEntry, "slug" | "hash" | "id">): string {
  return `debrid:${entry.slug}:${entry.hash || entry.id}`;
}

/** Season, episode and a short quality label read from a release or file name. */
export function describeRelease(name: string): {
  season: number | null;
  episode: number | null;
  label: string | null;
} {
  const ptt = parse(fileBaseName(name));
  const label = [ptt.resolution, ptt.source].filter(Boolean).join(" ");
  return { season: ptt.season ?? null, episode: ptt.episode ?? null, label: label || null };
}

/** The base name of a file path inside a torrent. */
export function fileBaseName(name: string): string {
  return name.replace(/\\/g, "/").split("/").pop() || name;
}
