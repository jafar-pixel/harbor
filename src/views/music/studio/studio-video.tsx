import { useEffect, useRef, type CSSProperties } from "react";
import { Pause, Play, SkipBack, Shuffle } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  attachVideoDecks,
  autoBlend,
  clearVideoError,
  cueVideoDeck,
  nudgeRate,
  screenMix,
  seekVideoDeck,
  setVideoCrossfader,
  setVideoCurve,
  setVideoVolume,
  toggleVideoDeck,
  useVideoDecks,
  type VideoDeck,
} from "@/lib/music/studio/video-decks";
import { formatTime } from "./studio-controls";

const CURVES = [
  { id: "smooth", label: "Smooth" },
  { id: "linear", label: "Linear" },
  { id: "cut", label: "Scratch" },
] as const;

/**
 * Video decks: two YouTube music videos on one screen. The crossfader blends picture and sound
 * together; Auto blend mixes to the other deck over a phrase. Load songs from YouTube Music in
 * the library below.
 */
export function StudioVideo() {
  const t = useT();
  const v = useVideoDecks();
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (a.current && b.current) return attachVideoDecks(a.current, b.current);
  }, []);
  const [oa, ob] = screenMix(v.crossfader);
  return (
    <div className="sv">
      <div className="sv-screen" aria-label={t("Video mix")}>
        <div ref={a} className="sv-slot" style={{ opacity: oa } as CSSProperties} />
        <div ref={b} className="sv-slot" style={{ opacity: ob } as CSSProperties} />
        {!v.decks[0].song && !v.decks[1].song && (
          <p className="sv-empty">
            {t("Load songs from YouTube Music below onto deck A and deck B, then blend them.")}
          </p>
        )}
      </div>
      {v.error && (
        <p role="alert" className="studio-error" onClick={clearVideoError}>
          {v.error}
        </p>
      )}
      <div className="sv-console">
        <VideoDeckPanel i={0} deck={v.decks[0]} />
        <div className="sv-mixer">
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={v.crossfader}
            aria-label={t("Crossfader")}
            onChange={(e) => setVideoCrossfader(Number(e.target.value))}
            onDoubleClick={() => setVideoCrossfader(0)}
          />
          <div className="studio-curves" role="group" aria-label={t("Crossfader curve")}>
            {CURVES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`studio-btn studio-mini${v.curve === c.id ? " is-on" : ""}`}
                onClick={() => setVideoCurve(c.id)}
              >
                {t(c.label)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="studio-btn sv-blend"
            disabled={v.blending || !v.decks[v.crossfader <= 0 ? 1 : 0].song}
            onClick={() => autoBlend()}
          >
            <Shuffle size={15} />{" "}
            {v.blending
              ? t("Blending…")
              : v.crossfader <= 0
                ? t("Auto blend to B")
                : t("Auto blend to A")}
          </button>
        </div>
        <VideoDeckPanel i={1} deck={v.decks[1]} />
      </div>
    </div>
  );
}

function VideoDeckPanel({ i, deck }: { i: 0 | 1; deck: VideoDeck }) {
  const t = useT();
  const name = i === 0 ? "A" : "B";
  const progress = deck.duration ? deck.position / deck.duration : 0;
  return (
    <section className="sv-deck" data-deck={i} aria-label={t("Deck {name}", { name })}>
      <div className="sv-deck-head">
        <span className="sv-deck-name">{name}</span>
        {deck.song?.art ? <img src={deck.song.art} alt="" /> : <span className="sv-noart" />}
        <div className="sv-deck-text">
          <strong>{deck.song?.title ?? t("Empty deck")}</strong>
          <span>{deck.song?.artist ?? t("Load a song from YouTube Music")}</span>
        </div>
        <div className="sv-deck-meta">
          <strong>{deck.song?.bpm ? `${Math.round(deck.song.bpm * deck.rate)} BPM` : ""}</strong>
          <em>{deck.song?.key ?? ""}</em>
        </div>
      </div>
      <input
        type="range"
        className="sv-seek"
        min={0}
        max={Math.max(1, deck.duration)}
        step={0.5}
        value={Math.min(deck.position, Math.max(1, deck.duration))}
        aria-label={t("Position on deck {name}", { name })}
        style={{ "--fill": `${progress * 100}%` } as CSSProperties}
        disabled={!deck.song}
        onChange={(e) => seekVideoDeck(i, Number(e.target.value))}
      />
      <div className="sv-times">
        <span>{formatTime(deck.position)}</span>
        <span>-{formatTime(Math.max(0, deck.duration - deck.position))}</span>
      </div>
      <div className="sv-controls">
        <button
          type="button"
          className="studio-btn"
          aria-label={t("Cue")}
          disabled={!deck.song}
          onClick={() => cueVideoDeck(i)}
        >
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          className="studio-btn sv-play"
          aria-label={deck.playing ? t("Pause") : t("Play")}
          disabled={!deck.song}
          onClick={() => toggleVideoDeck(i)}
        >
          {deck.playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <div className="sv-rate" role="group" aria-label={t("Tempo")}>
          <button
            type="button"
            className="studio-btn studio-mini"
            aria-label={t("Slower")}
            disabled={!deck.song}
            onClick={() => nudgeRate(i, -1)}
          >
            −
          </button>
          <span>{Math.round(deck.rate * 100)}%</span>
          <button
            type="button"
            className="studio-btn studio-mini"
            aria-label={t("Faster")}
            disabled={!deck.song}
            onClick={() => nudgeRate(i, 1)}
          >
            +
          </button>
        </div>
        <label className="sv-volume">
          <span className="sr-only">{t("Volume deck {name}", { name })}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={deck.volume}
            style={{ "--fill": `${deck.volume}%` } as CSSProperties}
            onChange={(e) => setVideoVolume(i, Number(e.target.value))}
          />
        </label>
      </div>
    </section>
  );
}
