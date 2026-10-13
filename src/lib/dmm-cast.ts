/**
 * Debrid Media Manager "Cast": DMM saves the file you picked against the title, then opens
 * `stremio:///detail/<type>/<id>/<videoId>`. When its Cast addon is installed, JL asks that addon
 * for the title's streams and plays your newest cast instead of stopping on the title page.
 */
import { filterEnabled, installFromUrl, loadInstalled } from "@/lib/addon-store";
import { safeFetch } from "@/lib/safe-fetch";

const DMM_CAST_ID = /^com\.debridmediamanager\.cast(?:\.|$)/;
// DMM marks the requester's own casts; everyone else's casts on the title come after them.
const YOURS = /\(Yours\)/;
const TIMEOUT_MS = 8000;

export type DmmCastStream = { url: string; title: string };

type RawStream = { url?: unknown; title?: unknown; description?: unknown; name?: unknown };

export function isDmmCastAddonId(id: string | undefined): boolean {
  return !!id && DMM_CAST_ID.test(id);
}

/** The first of your own casts in a DMM stream list, which DMM sends newest first. */
export function pickYourCast(streams: readonly RawStream[]): DmmCastStream | null {
  for (const s of streams) {
    if (typeof s.url !== "string" || !/^https?:\/\//i.test(s.url)) continue;
    const label = typeof s.title === "string" ? s.title : s.description;
    if (typeof label !== "string" || !YOURS.test(label)) continue;
    // DMM breaks a long file name in two with "-\n"; undo that before taking the first line.
    return { url: s.url, title: label.replace("-\n", "").split("\n")[0].trim() };
  }
  return null;
}

function dmmCastAddons() {
  return filterEnabled(loadInstalled()).filter((a) => isDmmCastAddonId(a.manifest?.id ?? a.id));
}

const baseOf = (transportUrl: string) => transportUrl.replace(/\/manifest\.json$/, "");

async function fetchJson<T>(url: string): Promise<T | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await safeFetch(url, {
      headers: { Accept: "application/json" },
      signal: ac.signal,
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function yourCastAt(base: string, type: string, videoId: string) {
  const url = `${base}/stream/${encodeURIComponent(type)}/${encodeURIComponent(videoId)}.json`;
  const json = await fetchJson<{ streams?: RawStream[] }>(url);
  return pickYourCast(Array.isArray(json?.streams) ? json.streams : []);
}

/** Your newest DMM cast for a video, or null when no Cast addon is installed or nothing is cast. */
export async function findDmmCast(type: string, videoId: string): Promise<DmmCastStream | null> {
  for (const addon of dmmCastAddons()) {
    const pick = await yourCastAt(baseOf(addon.transportUrl), type, videoId);
    if (pick) return pick;
  }
  return null;
}

/**
 * What DMM's cast lists show for one Cast addon: the title cast most recently (its catalogs list
 * titles newest first) and, for a movie, the file your cast points at, so casting the same movie
 * again with another file still counts as new.
 */
export type CastSnapshot = { movieId?: string; movieUrl?: string; showId?: string };

type Catalog = { type?: string; id?: string };

/** The cast catalogs in a Cast addon's manifest; the "No Catalog" install has none. */
export function castCatalogs(catalogs: readonly Catalog[] | undefined): {
  movie?: string;
  series?: string;
} {
  const find = (type: string, suffix: string) =>
    catalogs?.find((c) => c.type === type && typeof c.id === "string" && c.id.endsWith(suffix))?.id;
  return { movie: find("movie", "casted-movies"), series: find("series", "casted-shows") };
}

/** The cast to act on when a snapshot changes, or null for the first look or no change. */
export function newCastBetween(
  before: CastSnapshot | undefined,
  after: CastSnapshot,
): { type: "movie" | "series"; id: string } | null {
  if (!before) return null;
  if (after.movieId && (after.movieId !== before.movieId || after.movieUrl !== before.movieUrl)) {
    return { type: "movie", id: after.movieId };
  }
  if (after.showId && after.showId !== before.showId) return { type: "series", id: after.showId };
  return null;
}

async function snapshotOf(addon: { transportUrl: string; manifest?: { catalogs?: Catalog[] } }) {
  const base = baseOf(addon.transportUrl);
  const ids = castCatalogs(addon.manifest?.catalogs);
  if (!ids.movie && !ids.series) return null;
  const top = async (type: string, id?: string) => {
    if (!id) return undefined;
    const json = await fetchJson<{ metas?: Array<{ id?: unknown }> }>(
      `${base}/catalog/${type}/${encodeURIComponent(id)}.json`,
    );
    if (!json) throw new Error("unreachable");
    const first = json.metas?.[0]?.id;
    return typeof first === "string" && first.startsWith("tt") ? first : undefined;
  };
  const [movieId, showId] = await Promise.all([top("movie", ids.movie), top("series", ids.series)]);
  const movieUrl = movieId ? (await yourCastAt(base, "movie", movieId))?.url : undefined;
  return { movieId, movieUrl, showId } satisfies CastSnapshot;
}

/**
 * Watches your DMM cast lists while the app is open, so Cast in DMM on any device reaches this
 * one: the TV and the web app can't receive DMM's stremio:// link the way the desktop app does.
 * The first look only records where the lists stand; later changes call `onCast`.
 */
export function watchDmmCasts(
  onCast: (cast: { type: "movie" | "series"; id: string }) => void,
  intervalMs = 15_000,
): () => void {
  const seen = new Map<string, CastSnapshot>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped) return;
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      for (const addon of dmmCastAddons()) {
        const snap = await snapshotOf(addon).catch(() => null);
        if (stopped) return;
        if (!snap) continue;
        const cast = newCastBetween(seen.get(addon.transportUrl), snap);
        seen.set(addon.transportUrl, snap);
        if (cast) onCast(cast);
      }
    }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

const APPLIED_KEY = "jl.dmmcast.applied";

export function parseCastLinks(links: string): string[] {
  return [...new Set(links.split(/\s+/).filter((l) => /^https:\/\/\S+\/manifest\.json$/i.test(l)))];
}

/**
 * Keeps the synced `dmmCastLinks` setting and this device's Cast addons in step: a link that
 * arrived from the account is installed once (removing it here later is respected), and a Cast
 * addon installed here is added to the setting so the account carries it to the other devices.
 * Returns the new setting value, or null when it is unchanged.
 */
export async function reconcileDmmCastLinks(links: string): Promise<string | null> {
  const wanted = parseCastLinks(links);
  let applied: string[] = [];
  try {
    applied = JSON.parse(localStorage.getItem(APPLIED_KEY) ?? "[]") as string[];
  } catch {
    applied = [];
  }
  const installed = new Set(loadInstalled().map((a) => a.transportUrl));
  for (const url of wanted) {
    if (applied.includes(url) || installed.has(url)) continue;
    await installFromUrl(url).catch(() => undefined);
  }
  try {
    localStorage.setItem(APPLIED_KEY, JSON.stringify(wanted));
  } catch {
    /* storage unavailable: the next run tries the same installs again */
  }
  const local = dmmCastAddons()
    .map((a) => a.transportUrl)
    .filter((u) => /^https:\/\//i.test(u));
  const merged = [...new Set([...wanted, ...local])];
  return merged.length === wanted.length ? null : merged.join("\n");
}
