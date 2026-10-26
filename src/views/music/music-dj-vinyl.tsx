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
  coverOf,
}: {
  track: DjTrack | undefined;
  /** The song's place in the set: a lower index than before swaps the other way. */
  index: number;
  playing: boolean;
  why?: string;
  /** The song's album cover for the record label (falls back to the video thumbnail). */
  coverOf?: (track: DjTrack) => string | null;
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
          <Record
            key={`out:${leaving.key}`}
            cover={coverOf?.(leaving.track) ?? leaving.track.video?.thumb ?? null}
            phase="out"
            spinning
          />
        )}
        <Record
          key={`in:${shown.key}`}
          cover={coverOf?.(shown.track) ?? shown.track.video?.thumb ?? null}
          phase="in"
          spinning={playing}
        />
        <span className="dj-vinyl-arm">
          <span className="dj-vinyl-arm-base" />
          <span className="dj-vinyl-arm-rod" />
          <span className="dj-vinyl-arm-head" />
        </span>
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
  cover,
  phase,
  spinning,
}: {
  cover: string | null;
  phase: "in" | "out";
  spinning: boolean;
}) {
  return (
    <span className="dj-vinyl-record" data-phase={phase}>
      <span className="dj-vinyl-disc" data-spinning={spinning}>
        <span className="dj-vinyl-label">{cover ? <img src={cover} alt="" /> : null}</span>
      </span>
    </span>
  );
}
