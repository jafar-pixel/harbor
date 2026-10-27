import { useEffect, useRef, useState } from "react";
import { keyMatch } from "@/lib/music/dj/mixing";
import { HOT_CUES, type StudioDeck } from "@/lib/music/studio/deck";
import { studio } from "@/lib/music/studio/engine";
import { useT } from "@/lib/i18n";
import { Fader, Knob, formatTime } from "./studio-controls";
import { Turntable } from "./studio-turntable";
import { DeckOverview } from "./studio-wave";

const LOOPS = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32];
const PITCH_RANGES = [0.08, 0.16, 0.5] as const;
export const DECK_NAMES = ["A", "B", "C", "D"];
export type DeckLook = "turntable" | "jog";

/** Re-render a few times a second while playing, for clocks and readouts. */
export function useTicker(on: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [on]);
}

const loopLabel = (beats: number) => (beats >= 1 ? String(beats) : `1/${Math.round(1 / beats)}`);

/** Top strip: cover, title, artist and BPM, the big clock, the key, and the whole-track view. */
export function DeckHeader({ deck, art }: { deck: StudioDeck; art: string | null }) {
  const t = useT();
  useTicker(deck.playing);
  const track = deck.track;
  const other = studio.decks.find((d) => d !== deck && d.track && d.index < studio.deckCount);
  const match =
    track?.key && other?.track?.key ? keyMatch(track.key.camelot, other.track.key.camelot) : null;
  return (
    <div className="sd-head" data-deck={deck.index}>
      <span className="sd-head-art" style={art ? { backgroundImage: `url("${art}")` } : undefined}>
        {art ? "" : DECK_NAMES[deck.index]}
      </span>
      <div className="sd-head-text">
        <strong>{track?.title ?? t("Drop a track here")}</strong>
        <span>
          {track
            ? `${track.artist || "—"} · ${deck.bpm ? deck.bpm.toFixed(1) : "–"}`
            : t("or load one from the library")}
        </span>
      </div>
      <strong className="sd-head-clock">
        {track ? formatTime(deck.duration - deck.position) : "0:00"}
      </strong>
      <span
        className="sd-head-key"
        data-match={match ?? undefined}
        title={match ? t("Key against the other deck: {m}", { m: match }) : undefined}
      >
        {track?.key ? `${track.key.name} · ${track.key.camelot}` : "–"}
      </span>
      <DeckOverview deck={deck} />
    </div>
  );
}

/** SYNC, the tempo readout and the pitch fader with its range and nudge buttons. */
export function DeckPitch({ deck }: { deck: StudioDeck }) {
  const t = useT();
  const [range, setRange] = useState<(typeof PITCH_RANGES)[number]>(0.08);
  const pct = (deck.rate - 1) * 100;
  return (
    <div className="sd-pitch" data-deck={deck.index}>
      <button
        type="button"
        className="studio-btn sd-sync"
        disabled={!deck.bpm}
        onClick={() => {
          const master = studio.masterDeck(deck);
          if (master) deck.syncTo(master);
        }}
      >
        {t("SYNC")}
      </button>
      <strong className="sd-bpm">{deck.bpm ? deck.liveBpm.toFixed(1) : "–"}</strong>
      <span className="sd-pct">
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)}%
      </span>
      <Fader
        className="sd-pitch-fader"
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
        title={t("Pitch range")}
        onClick={() =>
          setRange(PITCH_RANGES[(PITCH_RANGES.indexOf(range) + 1) % PITCH_RANGES.length])
        }
      >
        ±{Math.round(range * 100)}
      </button>
      <div className="sd-nudge">
        {[-1, 1].map((dir) => (
          <button
            key={dir}
            type="button"
            className="studio-btn studio-mini"
            aria-label={dir < 0 ? t("Slow down") : t("Speed up")}
            onPointerDown={() => deck.setBend(dir * 0.04)}
            onPointerUp={() => deck.setBend(0)}
            onPointerLeave={() => deck.setBend(0)}
          >
            {dir < 0 ? "−" : "+"}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The jog area: a realistic turntable, or the classic jog display with tempo and clocks. */
export function DeckJog({
  deck,
  art,
  look,
}: {
  deck: StudioDeck;
  art: string | null;
  look: DeckLook;
}) {
  if (look === "turntable") return <Turntable deck={deck} art={art} />;
  return <JogDisplay deck={deck} />;
}

function JogDisplay({ deck }: { deck: StudioDeck }) {
  const ring = useRef<HTMLSpanElement>(null);
  useTicker(deck.playing);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (ring.current) ring.current.style.transform = `rotate(${(deck.position * 200) % 360}deg)`;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [deck]);
  const pct = (deck.rate - 1) * 100;
  return (
    <div className="sd-jog" aria-hidden="true">
      <span ref={ring} className="sd-jog-ring" />
      <div className="sd-jog-face">
        <span>
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(1)}%
        </span>
        <strong>{deck.bpm ? deck.liveBpm.toFixed(1) : "–"}</strong>
        <span>{formatTime(deck.position)}</span>
        <span>-{formatTime(deck.duration - deck.position)}</span>
      </div>
    </div>
  );
}

/** EQ, filter, channel fader with its meter, and crossfader side, beside each deck. */
export function ChannelStrip({ deck }: { deck: StudioDeck }) {
  const t = useT();
  return (
    <div className="sd-channel" data-deck={deck.index}>
      <div className="sd-eq">
        <Knob
          label={t("High")}
          value={deck.mix.high}
          min={-26}
          max={6}
          step={0.5}
          onChange={(high) => deck.setMix({ high })}
        />
        <Knob
          label={t("Mid")}
          value={deck.mix.mid}
          min={-26}
          max={6}
          step={0.5}
          onChange={(mid) => deck.setMix({ mid })}
        />
        <Knob
          label={t("Low")}
          value={deck.mix.low}
          min={-26}
          max={6}
          step={0.5}
          onChange={(low) => deck.setMix({ low })}
        />
      </div>
      <div className="sd-eq">
        <Knob
          label={t("Filter")}
          value={deck.mix.filter}
          min={-1}
          max={1}
          tone="#ffb13b"
          onChange={(filter) => deck.setMix({ filter: Math.abs(filter) < 0.04 ? 0 : filter })}
        />
        <Knob
          label={t("Gain")}
          value={deck.mix.trim}
          min={0}
          max={2}
          center={1}
          onChange={(trim) => deck.setMix({ trim })}
        />
        <div className="sd-fader">
          <Meter deck={deck} />
          <Fader
            label={t("Volume")}
            value={deck.mix.fader}
            min={0}
            max={1}
            onChange={(fader) => deck.setMix({ fader })}
            onReset={() => deck.setMix({ fader: 0.85 })}
          />
        </div>
      </div>
    </div>
  );
}

function Meter({ deck }: { deck: StudioDeck }) {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const scratch = new Float32Array(deck.analyser.fftSize);
    let level = 0;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      level = Math.max(deck.level(scratch), level * 0.9);
      if (bar.current) bar.current.style.transform = `scaleY(${level})`;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [deck]);
  return (
    <span className="studio-meter" aria-hidden="true">
      <span ref={bar} />
    </span>
  );
}

/** Play, Set (cue), loop size and on/off, beat jumps, and the hot cue pads. */
export function DeckTransport({ deck, pads }: { deck: StudioDeck; pads: boolean }) {
  const t = useT();
  const [loopSize, setLoopSize] = useState(4);
  const [deleting, setDeleting] = useState(false);
  const track = deck.track;
  const step = (dir: number) => {
    const i = Math.max(0, Math.min(LOOPS.length - 1, LOOPS.indexOf(loopSize) + dir));
    setLoopSize(LOOPS[i]);
    if (deck.loop) deck.resizeLoop(dir > 0 ? 2 : 0.5);
  };
  return (
    <div className="sd-transport" data-deck={deck.index}>
      <div className="sd-transport-row">
        <button
          type="button"
          className={`studio-btn sd-play${deck.playing ? " is-on" : ""}`}
          disabled={!track}
          onClick={() => deck.toggle()}
          aria-label={deck.playing ? t("Pause") : t("Play")}
        >
          {deck.playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          className="studio-btn sd-set"
          disabled={!track}
          onClick={() => deck.cuePress()}
        >
          {t("Set")}
        </button>
        <button
          type="button"
          className="studio-btn studio-mini"
          disabled={!track}
          onClick={() => deck.skipBeats(-4)}
          title={t("Back 4 beats")}
        >
          ⟲
        </button>
        <div className="sd-loop" role="group" aria-label={t("Loop")}>
          <button
            type="button"
            className="studio-btn studio-mini"
            onClick={() => step(-1)}
            aria-label={t("Smaller loop")}
          >
            ‹
          </button>
          <button
            type="button"
            className={`studio-btn sd-loop-size${deck.loop ? " is-on" : ""}`}
            disabled={!track}
            onClick={() => deck.setLoop(deck.loop ? deck.loop.beats : loopSize)}
            title={deck.loop ? t("Exit loop") : t("Loop {n} beats", { n: loopLabel(loopSize) })}
          >
            {loopLabel(deck.loop?.beats ?? loopSize)}
          </button>
          <button
            type="button"
            className="studio-btn studio-mini"
            onClick={() => step(1)}
            aria-label={t("Bigger loop")}
          >
            ›
          </button>
        </div>
        <button
          type="button"
          className="studio-btn studio-mini"
          disabled={!track}
          onClick={() => deck.skipBeats(4)}
          title={t("Forward 4 beats")}
        >
          ⟳
        </button>
      </div>
      {pads && (
        <div className="sd-pads" role="group" aria-label={t("Hot cues")}>
          {Array.from({ length: HOT_CUES }, (_, n) => {
            const set = deck.hotCues[n] != null;
            return (
              <button
                key={n}
                type="button"
                className={`studio-pad${set ? " is-set" : ""}`}
                data-pad={n}
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
          >
            {t("Clear")}
          </button>
        </div>
      )}
    </div>
  );
}
