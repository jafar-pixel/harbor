/** A rendition an adaptive (HLS) stream offers, as hls.js lists it. */
export type HlsRendition = { height: number; bitrate: number };

/** The lowest height Auto drops to while a sharper rendition exists. */
export const AUTO_FLOOR_HEIGHT = 720;

const PREF_KEY = "jl.player.stream-quality.v1";

/** Distinct rendition heights, highest first. */
export function renditionHeights(levels: readonly HlsRendition[]): number[] {
  const heights = new Set<number>();
  for (const l of levels) if (l.height > 0) heights.add(l.height);
  return [...heights].sort((a, b) => b - a);
}

/**
 * Index of the rendition to hold for a chosen height: the best one at or under it, or the
 * smallest when every rendition is larger.
 */
export function levelForHeight(levels: readonly HlsRendition[], maxHeight: number): number {
  let best = -1;
  let smallest = -1;
  levels.forEach((l, i) => {
    if (smallest < 0 || l.height < levels[smallest].height) smallest = i;
    if (l.height <= 0 || l.height > maxHeight) return;
    const b = best < 0 ? null : levels[best];
    if (!b || l.height > b.height || (l.height === b.height && l.bitrate > b.bitrate)) best = i;
  });
  return best >= 0 ? best : smallest;
}

/**
 * The bitrate Auto never switches below. A short stall otherwise sends hls.js down to its
 * lowest rendition (often 480p or less) and it climbs back slowly; holding at 720p rebuffers
 * briefly instead. Zero when nothing reaches 720p, so a small stream still adapts freely.
 */
export function autoFloorBitrate(levels: readonly HlsRendition[]): number {
  let floor = 0;
  for (const l of levels) {
    if (l.height < AUTO_FLOOR_HEIGHT || l.bitrate <= 0) continue;
    if (floor === 0 || l.bitrate < floor) floor = l.bitrate;
  }
  return floor;
}

/**
 * The rendition a live stream steps down to after repeated stalls: the next smaller height, but
 * never below the 720p floor while a 720p or sharper rendition exists. The same index when there
 * is nowhere to go.
 */
export function stepDownLevel(levels: readonly HlsRendition[], current: number): number {
  const now = levels[current];
  if (!now) return current;
  const floor = levels.some((l) => l.height >= AUTO_FLOOR_HEIGHT) ? AUTO_FLOOR_HEIGHT : 0;
  let best = current;
  levels.forEach((l, i) => {
    if (l.height >= now.height || l.height < floor) return;
    if (best === current || l.height > levels[best].height) best = i;
  });
  return best;
}

export function qualityLabel(height: number): string {
  if (height >= 2000) return "4K";
  return `${height}p`;
}

/** The viewer's chosen maximum height on this device, or null for Auto. */
export function readStreamQualityPref(): number | null {
  try {
    const n = Number(localStorage.getItem(PREF_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeStreamQualityPref(height: number | null): void {
  try {
    if (height == null) localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, String(height));
  } catch {
    /* storage unavailable: the choice lasts for this stream only */
  }
}
