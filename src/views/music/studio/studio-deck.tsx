import { useEffect, useState } from "react";
import { HOT_CUES, type StudioDeck } from "@/lib/music/studio/deck";
import { studio } from "@/lib/music/studio/engine";
import { useT } from "@/lib/i18n";
import { Fader, formatTime } from "./studio-controls";
import { Turntable } from "./studio-turntable";
import { DeckOverview } from "./studio-wave";

const LOOPS = [0.5, 1, 2, 4, 8, 16];
const PITCH_RANGES = [0.08, 0.16, 0.5] as const;
const DECK_NAMES = ["A", "B", "C", "D"];

/** Re-render a few times a second for the clock and the platter. */
function useTicker(on: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [on]);
  return tick;
}

/**
 * One deck: the record, track and tempo readout, SYNC / CUE / PLAY, pitch fader, hot cue pads,
 * beat loops and beat jumps.
 */
export function StudioDeckPanel({
  deck,
  compact,
  art,
}: {
  deck: StudioDeck;
  compact?: boolean;
  art?: string | null;
}) {
  const t = useT();
  useTicker(deck.playing);
  const [range, setRange] = useState<(typeof PITCH_RANGES)[number]>(0.08);
  const [deleting, setDeleting] = useState(false);
  const track = deck.track;
  const name = DECK_NAMES[deck.index];
  const pitchPct = (deck.rate - 1) * 100;

  const sync = () => {
    const master = studio.masterDeck(deck);
    if (master) deck.syncTo(master);
  };

  return (
    <section
      className={`studio-deck${compact ? " studio-deck-compact" : ""}`}
      data-deck={deck.index}
      aria-label={t("Deck {name}", { name })}
    >
      <header className="studio-deck-head">
        <span
          className="studio-deck-name"
          style={art ? { backgroundImage: `url("${art}")` } : undefined}
        >
          {art ? "" : name}
        </span>
        <div className="studio-deck-title">
          <strong>{track?.title ?? t("Load a track")}</strong>
          <span>{track?.artist ?? t("Pick one from the library below")}</span>
        </div>
        <div className="studio-deck-tempo">
          <strong>{deck.bpm ? deck.liveBpm.toFixed(1) : "–"}</strong>
          <span>
            {pitchPct >= 0 ? "+" : ""}
            {pitchPct.toFixed(1)}%
          </span>
        </div>
        <div className="studio-deck-time">
          <strong>-{formatTime(deck.duration - deck.position)}</strong>
          <span>{formatTime(deck.position)}</span>
        </div>
      </header>
      <DeckOverview deck={deck} />
      <div className="studio-deck-body">
        {!compact && <Turntable deck={deck} art={art} />}
        <div className="studio-pitch">
          <button
            type="button"
            className="studio-btn studio-sync"
            disabled={!deck.bpm}
            onClick={sync}
          >
            {t("SYNC")}
          </button>
          <Fader
            className="studio-pitch-fader"
            label={t("Pitch")}
            value={-(deck.rate - 1)}
            min={-range}
            max={range}
            onChange={(v) => deck.setRate(1 - v)}
            onReset={() => deck.setRate(1)}
          />
          <button
            type="button"
            className="studio-btn studio-mini"
            onClick={() =>
              setRange(PITCH_RANGES[(PITCH_RANGES.indexOf(range) + 1) % PITCH_RANGES.length])
            }
            title={t("Pitch range")}
          >
            ±{Math.round(range * 100)}%
          </button>
          <div className="studio-nudge">
            <button
              type="button"
              className="studio-btn studio-mini"
              aria-label={t("Slow down")}
              onPointerDown={() => deck.setBend(-0.04)}
              onPointerUp={() => deck.setBend(0)}
              onPointerLeave={() => deck.setBend(0)}
            >
              −
            </button>
            <button
              type="button"
              className="studio-btn studio-mini"
              aria-label={t("Speed up")}
              onPointerDown={() => deck.setBend(0.04)}
              onPointerUp={() => deck.setBend(0)}
              onPointerLeave={() => deck.setBend(0)}
            >
              +
            </button>
          </div>
        </div>
      </div>
      <div className="studio-transport">
        <button
          type="button"
          className="studio-btn studio-cue"
          disabled={!track}
          onClick={() => deck.cuePress()}
        >
          {t("CUE")}
        </button>
        <button
          type="button"
          className={`studio-btn studio-play${deck.playing ? " is-on" : ""}`}
          disabled={!track}
          onClick={() => deck.toggle()}
          aria-label={deck.playing ? t("Pause") : t("Play")}
        >
          {deck.playing ? "❚❚" : "▶"}
        </button>
        <div className="studio-jumps">
          {[-4, -1, 1, 4].map((b) => (
            <button
              key={b}
              type="button"
              className="studio-btn studio-mini"
              disabled={!track}
              onClick={() => deck.skipBeats(b)}
              title={t("Jump {n} beats", { n: b })}
            >
              {b > 0 ? `+${b}` : b}
            </button>
          ))}
        </div>
      </div>
      <div className="studio-pads" role="group" aria-label={t("Hot cues")}>
        {Array.from({ length: compact ? 4 : HOT_CUES }, (_, n) => {
          const set = deck.hotCues[n] != null;
          return (
            <button
              key={n}
              type="button"
              className={`studio-pad${set ? " is-set" : ""}`}
              disabled={!track}
              onClick={() => (deleting && set ? deck.clearHotCue(n) : deck.hotCue(n))}
            >
              {set && deleting ? "✕" : n + 1}
            </button>
          );
        })}
        <button
          type="button"
          className={`studio-btn studio-mini${deleting ? " is-on" : ""}`}
          onClick={() => setDeleting(!deleting)}
          title={t("Clear hot cues")}
        >
          {t("Clear")}
        </button>
      </div>
      <div className="studio-loops" role="group" aria-label={t("Loops")}>
        <button
          type="button"
          className="studio-btn studio-mini"
          disabled={!deck.loop}
          onClick={() => deck.resizeLoop(0.5)}
        >
          ÷2
        </button>
        {LOOPS.map((beats) => (
          <button
            key={beats}
            type="button"
            className={`studio-btn studio-loop${deck.loop?.beats === beats ? " is-on" : ""}`}
            disabled={!track}
            onClick={() => deck.setLoop(beats)}
          >
            {beats < 1 ? "½" : beats}
          </button>
        ))}
        <button
          type="button"
          className="studio-btn studio-mini"
          disabled={!deck.loop}
          onClick={() => deck.resizeLoop(2)}
        >
          ×2
        </button>
      </div>
    </section>
  );
}
