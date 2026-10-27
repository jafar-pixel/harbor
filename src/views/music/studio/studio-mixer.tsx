import { useEffect, useRef } from "react";
import type { StudioDeck, XfadeSide } from "@/lib/music/studio/deck";
import { studio, type XfadeCurve } from "@/lib/music/studio/engine";
import { useT } from "@/lib/i18n";
import { Fader, Knob } from "./studio-controls";

const SIDES: XfadeSide[] = ["A", "thru", "B"];
const CURVES: { id: XfadeCurve; label: string }[] = [
  { id: "smooth", label: "Smooth" },
  { id: "linear", label: "Linear" },
  { id: "cut", label: "Scratch" },
];

/**
 * The mixer: per channel trim, three-band EQ (turn fully left to kill a band, for bass swaps),
 * a filter knob, the level meter and the channel fader; then crossfader assignment, the
 * crossfader and its curve, and master volume into the limiter.
 */
export function StudioMixer({ decks }: { decks: StudioDeck[] }) {
  const t = useT();
  return (
    <section className="studio-mixer" aria-label={t("Mixer")}>
      <div className="studio-channels">
        {decks.map((deck) => (
          <div key={deck.index} className="studio-channel" data-deck={deck.index}>
            <Knob
              label={t("Trim")}
              value={deck.mix.trim}
              min={0}
              max={2}
              center={1}
              onChange={(trim) => deck.setMix({ trim })}
            />
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
            <Knob
              label={t("Filter")}
              value={deck.mix.filter}
              min={-1}
              max={1}
              tone="#ffb13b"
              onChange={(filter) => deck.setMix({ filter: Math.abs(filter) < 0.04 ? 0 : filter })}
            />
            <div className="studio-channel-fader">
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
            <div className="studio-assign" role="group" aria-label={t("Crossfader side")}>
              {SIDES.map((side) => (
                <button
                  key={side}
                  type="button"
                  className={`studio-btn studio-mini${deck.side === side ? " is-on" : ""}`}
                  onClick={() => studio.setSide(deck, side)}
                >
                  {side === "thru" ? t("Thru") : side}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="studio-xfade">
        <span>A</span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={studio.crossfader}
          aria-label={t("Crossfader")}
          onChange={(e) => studio.setCrossfader(Number(e.target.value))}
          onDoubleClick={() => studio.setCrossfader(0)}
        />
        <span>B</span>
      </div>
      <div className="studio-master">
        <div className="studio-curves" role="group" aria-label={t("Crossfader curve")}>
          {CURVES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`studio-btn studio-mini${studio.curve === c.id ? " is-on" : ""}`}
              onClick={() => studio.setCurve(c.id)}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
        <Knob
          label={t("Master")}
          value={studio.masterVolume}
          min={0}
          max={1.2}
          center={0.9}
          onChange={(v) => studio.setMasterVolume(v)}
        />
      </div>
    </section>
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
