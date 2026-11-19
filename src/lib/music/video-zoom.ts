/** The shape the music screens show videos in. */
export const SCREEN_ASPECT = 16 / 9;

/**
 * How much to enlarge a video so it fills its screen past YouTube's black bars (a square album
 * cover shown in a wide frame, a wide video in a square one). Plain module, no I/O.
 */
export function screenZoom(aspect: number | undefined, screen = SCREEN_ASPECT): number {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return 1;
  if (!Number.isFinite(screen) || screen <= 0) return 1;
  return Math.min(2.4, Math.max(aspect / screen, screen / aspect));
}
