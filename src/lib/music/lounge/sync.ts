/**
 * Listening Lounge timing, shared by the host and guests: where the song on should be, and when
 * a guest has drifted far enough to seek. Plain functions, no I/O.
 */

export type LoungeClock = {
  /** When the song on would have started had it never been paused (ms, server time). */
  startedAt: number | null;
  /** When the host paused it (ms, server time), or null while playing. */
  pausedAt: number | null;
};

/** Seconds into the song at `serverNow` (ms). */
export function loungePosition(clock: LoungeClock, serverNow: number): number {
  if (clock.startedAt === null) return 0;
  const at = clock.pausedAt ?? serverNow;
  return Math.max(0, (at - clock.startedAt) / 1000);
}

/** A guest more than `tolerance` seconds off the host jumps to the right place. */
export function needsSeek(current: number, target: number, tolerance = 2.5): boolean {
  return Math.abs(current - target) > tolerance;
}

/** Resuming moves the start forward by how long the song was paused, so position holds. */
export function resumeClock(clock: LoungeClock, serverNow: number): LoungeClock {
  if (clock.startedAt === null || clock.pausedAt === null) return clock;
  return { startedAt: clock.startedAt + (serverNow - clock.pausedAt), pausedAt: null };
}

/** The offset to add to this device's clock to get the server's, from one round trip. */
export function clockOffset(sentAt: number, serverMs: number, receivedAt: number): number {
  return serverMs - (sentAt + receivedAt) / 2;
}

export const REACTIONS = ["🔥", "❤️", "🙌", "😂", "🎶", "💯"] as const;
