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

/**
 * Live TV's buffer: about five segments behind live (10 to 30 seconds, by the provider's segment
 * length) with up to a minute buffered, so a slow segment from the provider doesn't stall the
 * picture. The preview's three segments and 30 seconds left full screen too little cushion.
 */
export const LIVE_HLS_BUFFER = {
  liveSyncDurationCount: 5,
  liveMaxLatencyDurationCount: 10,
  maxBufferLength: 60,
  maxMaxBufferLength: 120,
  maxBufferSize: 160 * 1024 * 1024,
};
