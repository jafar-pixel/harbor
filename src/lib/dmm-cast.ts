/**
 * Debrid Media Manager "Cast": DMM saves the file you picked against the title, then opens
 * `stremio:///detail/<type>/<id>/<videoId>`. When its Cast addon is installed, JL asks that addon
 * for the title's streams and plays your newest cast instead of stopping on the title page.
 */
import { filterEnabled, loadInstalled } from "@/lib/addon-store";
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

/** Your newest DMM cast for a video, or null when no Cast addon is installed or nothing is cast. */
export async function findDmmCast(type: string, videoId: string): Promise<DmmCastStream | null> {
  const addons = filterEnabled(loadInstalled()).filter((a) =>
    isDmmCastAddonId(a.manifest?.id ?? a.id),
  );
  for (const addon of addons) {
    const base = addon.transportUrl.replace(/\/manifest\.json$/, "");
    const url = `${base}/stream/${encodeURIComponent(type)}/${encodeURIComponent(videoId)}.json`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await safeFetch(url, {
        headers: { Accept: "application/json" },
        signal: ac.signal,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { streams?: RawStream[] };
      const pick = pickYourCast(Array.isArray(json.streams) ? json.streams : []);
      if (pick) return pick;
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
