import type { DebridSlug, RankedPicker, ScoredStream, Tier } from "../types";
import { isCached } from "../cached";
import { hdrRank, pictureRank, type BestPicture } from "../best-picture";

export function rankAndPick(
  scored: ScoredStream[],
  activeDebrids: DebridSlug[],
  preferAac = false,
  respectAddonOrder = false,
  bestPicture: BestPicture = false,
): RankedPicker {
  const pri = (s: ScoredStream) => s.addonPriority ?? Number.MAX_SAFE_INTEGER;
  const ret = (s: ScoredStream) => s.addonReturnIdx ?? Number.MAX_SAFE_INTEGER;
  const ready = (s: ScoredStream) => (isCached(s, activeDebrids) ? 0 : 1);
  const all = scored.slice().sort((a, b) =>
    bestPicture
      ? // Ready copies first, best picture first among them (4K Dolby Vision, 4K HDR, 4K, 1080p...).
        ready(a) - ready(b) ||
        pictureRank(bestPicture, a.resolution) - pictureRank(bestPicture, b.resolution) ||
        hdrRank(a.hdrFormat) - hdrRank(b.hdrFormat) ||
        b.score - a.score
      : respectAddonOrder
        ? pri(a) - pri(b) || ret(a) - ret(b) || b.score - a.score
        : b.score - a.score,
  );
  const cachedFirst = all.slice().sort((a, b) => {
    const ac = isCached(a, activeDebrids) ? 1 : 0;
    const bc = isCached(b, activeDebrids) ? 1 : 0;
    return bc - ac;
  });

  const byTier: Partial<Record<Tier, ScoredStream>> = {};
  for (const s of cachedFirst) {
    if (!byTier[s.tier]) byTier[s.tier] = s;
  }

  let primary = all.find((s) => isCached(s, activeDebrids)) ?? null;
  if (bestPicture) {
    // The best ready picture plays, not just the first ready row in add-on order (on the Shield
    // that was a 1080p file from the first add-on while a 4K Dolby Vision copy was ready).
    for (const s of all) {
      if (!isCached(s, activeDebrids) || !primary) continue;
      const d =
        pictureRank(bestPicture, s.resolution) - pictureRank(bestPicture, primary.resolution) ||
        hdrRank(s.hdrFormat) - hdrRank(primary.hdrFormat);
      if (d < 0) primary = s;
    }
  }
  if (preferAac && primary) {
    const aac = all.find((s) => isCached(s, activeDebrids) && s.audio?.codec === "AAC");
    if (aac) primary = aac;
  }

  return { primary, byTier, all };
}
