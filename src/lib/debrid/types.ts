import type { DebridSlug } from "@/lib/streams/types";
import type { EpisodeHint } from "@/lib/streams/episode-file";

export type { DebridSlug };

export type DebridResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; status: number; raw?: unknown };

export type Account = {
  slug: DebridSlug;
  username?: string;
  email?: string;
  premium: boolean;
  premiumUntil?: number;
  trafficUsed?: number;
  trafficLimit?: number;
};

export type CacheMap = Record<string, boolean>;

export type DirectLink = {
  url: string;
  fileIdx?: number | null;
  filename?: string;
  filesize?: number;
  headers?: Record<string, string>;
  notWebReady?: boolean;
  subtitles?: Array<{ url: string; lang?: string; id?: string }>;
};

export type DebridFile = {
  id: string;
  name: string;
  size: number;
  selected?: boolean;
};

export type Transfer = {
  id: string;
  hash: string;
  name?: string;
  ready: boolean;
  files: DebridFile[];
};

export type LibraryFile = {
  id: string;
  name: string;
  size: number;
  /** The fileIdx playableUrl expects for this file, when it differs from its list position. */
  fileIdx?: number;
};

export type LibraryEntry = {
  slug: DebridSlug;
  id: string;
  hash: string;
  name: string;
  size?: number;
  files?: LibraryFile[];
  /** When the torrent was added to the account, in epoch milliseconds. */
  added?: number;
  /** Number of downloaded files, when the provider reports it without listing them. */
  fileCount?: number;
};

export type LibraryListOptions = {
  /** Skip the short-lived cache and fetch the account again. */
  refresh?: boolean;
};

export type DebridStore = {
  slug: DebridSlug;
  name: string;
  account(signal: AbortSignal): Promise<DebridResult<Account>>;
  cacheCheck(hashes: string[], signal: AbortSignal): Promise<DebridResult<CacheMap>>;
  playableUrl(
    magnet: string,
    fileIdx: number | undefined,
    signal: AbortSignal,
    hint?: EpisodeHint,
  ): Promise<DebridResult<DirectLink>>;
  queueCache?(magnet: string, signal: AbortSignal): Promise<DebridResult<{ id: string }>>;
  listLibrary(signal: AbortSignal): Promise<DebridResult<LibraryEntry[]>>;
  /** Every finished torrent in the account, for browsing. listLibrary stays capped for matching. */
  listAllLibrary?(
    signal: AbortSignal,
    onProgress?: (loaded: number) => void,
    options?: LibraryListOptions,
  ): Promise<DebridResult<LibraryEntry[]>>;
  /** The downloaded files of one library torrent, each carrying its playableUrl fileIdx. */
  libraryFiles?(id: string, signal: AbortSignal): Promise<DebridResult<LibraryFile[]>>;
  /**
   * A direct link for a torrent already in the library, without adding it again (playableUrl
   * re-adds the magnet, which leaves a duplicate on Real-Debrid). `fileIdx` as in libraryFiles.
   */
  libraryLink?(
    id: string,
    fileIdx: number | undefined,
    signal: AbortSignal,
  ): Promise<DebridResult<DirectLink>>;
};

export function magnetFromHash(hash: string): string {
  if (hash.startsWith("magnet:")) return hash;
  return `magnet:?xt=urn:btih:${hash}`;
}

export function hashFromMagnet(input: string): string {
  if (!input.startsWith("magnet:")) return input.toLowerCase();
  const m = input.match(/xt=urn:btih:([A-Fa-f0-9]+)/);
  return m ? m[1].toLowerCase() : input.toLowerCase();
}
