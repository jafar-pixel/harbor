import { useEffect, useRef, useState } from "react";
import type { DjTrack } from "@/lib/music/dj/session";
import { songKey } from "@/lib/music/dj/vibes";

/** How long the outgoing record stays mounted: the slide out, plus the arm settling back. */
const SWAP_MS = 720;

type Shown = { key: string; track: DjTrack };

/**
 * The now-playing record for the AI DJ. On a new song the tonearm lifts, the record spins off
 * to one side, the next slides in from the other with a little overshoot and starts turning,
 * then the arm drops back. Titles swap with a short stagger. Next goes left, previous right.
 */
export function DjVinyl({
  track,
  index,
  playing,
  why,
}: {
  track: DjTrack | undefined;
  /** The song's place in the set: a lower index than before swaps the other way. */
  index: number;
  playing: boolean;
  why?: string;
}) {
  const [shown, setShown] = useState<Shown | null>(track ? { key: songKey(track), track } : null);
  const [leaving, setLeaving] = useState<Shown | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const last = useRef<{ shown: Shown | null; index: number }>({ shown, index });
  const timer = useRef(0);
  const key = track ? songKey(track) : null;

  useEffect(() => {
    if (!track || !key) return;
    const next = { key, track };
    const prev = last.current;
    last.current = { shown: next, index };
    setShown(next);
    if (prev.shown && prev.shown.key !== key) {
      setDirection(index < prev.index ? -1 : 1);
      setLeaving(prev.shown);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLeaving(null), SWAP_MS);
    }
  }, [key, track, index]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!shown) return null;
  return (
    <div className="dj-vinyl" data-dir={direction} data-swapping={!!leaving}>
      <div className="dj-vinyl-deck" aria-hidden>
        {leaving && (
          <Record key={`out:${leaving.key}`} track={leaving.track} phase="out" spinning />
        )}
        <Record key={`in:${shown.key}`} track={shown.track} phase="in" spinning={playing} />
        <span className="dj-vinyl-arm" />
      </div>
      <div className="dj-vinyl-text">
        {leaving && (
          <span
            key={`t-out:${leaving.key}`}
            className="dj-vinyl-title"
            data-phase="out"
            aria-hidden
          >
            <strong>{leaving.track.title}</strong>
            <span>{leaving.track.artist}</span>
          </span>
        )}
        <span key={`t-in:${shown.key}`} className="dj-vinyl-title" data-phase="in">
          <strong>{shown.track.title}</strong>
          <span>{shown.track.artist}</span>
          {why && <em>{why}</em>}
        </span>
      </div>
    </div>
  );
}

function Record({
  track,
  phase,
  spinning,
}: {
  track: DjTrack;
  phase: "in" | "out";
  spinning: boolean;
}) {
  return (
    <span className="dj-vinyl-record" data-phase={phase}>
      <span className="dj-vinyl-disc" data-spinning={spinning}>
        <span className="dj-vinyl-label">
          {track.video?.thumb ? <img src={track.video.thumb} alt="" /> : null}
        </span>
      </span>
    </span>
  );
}
