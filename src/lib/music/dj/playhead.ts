/**
 * What the DJ decks are playing right now, written by the DJ view on every mixer tick. The
 * Listening Lounge reads it to tell guests what's on; nothing here touches the players.
 */

export type DjPlayhead = {
  videoId: string;
  artist: string;
  title: string;
  /** Seconds into the song. */
  position: number;
  paused: boolean;
  /** When this was written (ms, this device's clock). */
  at: number;
};

let playhead: DjPlayhead | null = null;
const pauseListeners = new Set<() => void>();

export function reportPlayhead(next: DjPlayhead | null): void {
  playhead = next;
}

/** The playhead, or null when the decks haven't reported for a few seconds (stopped or closed). */
export function readPlayhead(maxAgeMs = 5000): DjPlayhead | null {
  return playhead && Date.now() - playhead.at <= maxAgeMs ? playhead : null;
}

/** Ask the decks to pause (joining someone else's lounge). */
export function pauseDj(): void {
  for (const fn of pauseListeners) fn();
}
export function onPauseDj(fn: () => void): () => void {
  pauseListeners.add(fn);
  return () => pauseListeners.delete(fn);
}
