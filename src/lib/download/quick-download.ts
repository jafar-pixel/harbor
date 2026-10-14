/**
 * One-press downloads for the Offline hub: pick the best cached Real-Debrid / TorBox source (the
 * same choice auto-download makes) and queue it, so a movie or a whole season needs no source
 * picking. Peer-to-peer is used only when no debrid service is set up.
 */
import { useSyncExternalStore } from "react";
import type { Meta } from "@/lib/cinemeta";
import { gatherContext } from "@/lib/auto-download/context";
import { resolveBestDownload } from "@/lib/auto-download/resolve";
import { saveDownload } from "@/lib/download/save-download";
import type { PlayEpisode } from "@/lib/view";

const finding = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const keyOf = (metaId: string, episode?: PlayEpisode) =>
  episode ? `${metaId}:${episode.season}:${episode.episode}` : metaId;

function changed() {
  version += 1;
  for (const l of listeners) l();
}

/** True while a source is being found for this movie or episode. */
export function useQuickDownloadFinding(metaId: string, episode?: PlayEpisode): boolean {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return finding.has(keyOf(metaId, episode));
}

export type QuickDownloadResult = { queued: number; missing: PlayEpisode[]; movieMissing: boolean };

/**
 * Queues the movie (no episodes) or each episode. Episodes run two at a time; any without a
 * cached source come back in `missing` so the caller can offer the source list instead.
 */
export async function quickDownload(
  meta: Meta,
  episodes?: PlayEpisode[],
): Promise<QuickDownloadResult> {
  const targets: Array<PlayEpisode | undefined> = episodes?.length ? episodes : [undefined];
  const keys = targets.map((ep) => keyOf(meta.id, ep));
  const fresh = keys.filter((k) => !finding.has(k));
  for (const k of fresh) finding.add(k);
  changed();
  const result: QuickDownloadResult = { queued: 0, missing: [], movieMissing: false };
  try {
    const ctx = await gatherContext();
    const signal = new AbortController().signal;
    const imdbId = meta.id.startsWith("tt") ? meta.id : null;
    const queue = targets
      .map((ep, i) => ({ ep, key: keys[i] }))
      .filter((t) => fresh.includes(t.key));
    const work = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { ep, key } = next;
        try {
          const hit = await resolveBestDownload(meta, ep, {
            allowP2p: ctx.debrids.length === 0,
            maxHeight: null,
            imdbId,
            debrids: ctx.debrids,
            addons: ctx.addons,
            signal,
          });
          if (hit) {
            await saveDownload({
              meta,
              episode: ep,
              streamLabel: hit.label,
              url: hit.url,
              headers: hit.headers,
            });
            result.queued += 1;
          } else if (ep) result.missing.push(ep);
          else result.movieMissing = true;
        } catch {
          if (ep) result.missing.push(ep);
          else result.movieMissing = true;
        } finally {
          finding.delete(key);
          changed();
        }
      }
    };
    await Promise.all([work(), work()]);
  } finally {
    for (const k of fresh) finding.delete(k);
    changed();
  }
  return result;
}
