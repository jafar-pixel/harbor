import { useEffect, useRef } from "react";
import { timeOfBeat } from "@/lib/music/studio/analysis";
import type { StudioDeck } from "@/lib/music/studio/deck";

const DECK_COLORS = ["#2fb7ff", "#ff5a8a", "#ffb13b", "#7cf07a"];
// Bass, mids and highs, drawn over each other like a three-band DJ waveform.
const BANDS = [
  { key: "low", color: "#2c5bff" },
  { key: "mid", color: "#ff9d2e" },
  { key: "high", color: "#f4f7ff" },
] as const;

/**
 * The scrolling waveform of every loaded deck, stacked, with the playhead fixed in the middle,
 * beat grid lines, the cue and hot cues, and the active loop. Drawn every frame.
 */
export function StudioWaves({ decks, zoom }: { decks: StudioDeck[]; zoom: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const el = canvas.current;
      if (!el) return;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      const g = el.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const lane = h / decks.length;
      // Seconds across the view: wider zoom shows more.
      const span = 12 / zoom;
      decks.forEach((deck, i) => {
        const top = i * lane;
        const mid = top + lane / 2;
        g.fillStyle = i % 2 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.045)";
        g.fillRect(0, top, w, lane);
        const track = deck.track;
        if (!track) return;
        const pos = deck.position;
        const start = pos - span / 2;
        const pxPerSec = w / span;
        const wave = track.wave;
        // Loop region.
        if (deck.loop) {
          g.fillStyle = "rgba(124,240,122,0.16)";
          g.fillRect(
            (deck.loop.start - start) * pxPerSec,
            top,
            (deck.loop.end - deck.loop.start) * pxPerSec,
            lane,
          );
        }
        // Beat grid: bars brighter than beats.
        if (track.grid.bpm) {
          const beatLen = 60 / track.grid.bpm;
          const first = Math.ceil((start - track.grid.offset) / beatLen);
          for (let b = first; ; b++) {
            const at = timeOfBeat(track.grid, b);
            if (at > start + span) break;
            const x = (at - start) * pxPerSec;
            g.fillStyle = b % 4 === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)";
            g.fillRect(x, top, b % 4 === 0 ? 1.5 : 1, lane);
          }
        }
        // Waveform, one column per pixel, band by band.
        const amp = lane / 2 - 3;
        for (const band of BANDS) {
          const values = wave[band.key];
          g.fillStyle = band.color;
          for (let x = 0; x < w; x++) {
            const at = start + x / pxPerSec;
            if (at < 0 || at > deck.duration) continue;
            const v = values[Math.floor(at * wave.rate)] ?? 0;
            g.globalAlpha = at < pos ? 0.45 : 0.95;
            g.fillRect(x, mid - v * amp, 1, Math.max(1, v * amp * 2));
          }
        }
        g.globalAlpha = 1;
        g.fillStyle = DECK_COLORS[i % DECK_COLORS.length];
        g.fillRect(0, top, 3, lane);
        // Cue and hot cues.
        const mark = (at: number | null, color: string) => {
          if (at == null || at < start || at > start + span) return;
          const x = (at - start) * pxPerSec;
          g.fillStyle = color;
          g.fillRect(x - 1, top, 2, lane);
        };
        mark(deck.cue, "#ffffff");
        deck.hotCues.forEach((c) => mark(c, "#ffb13b"));
      });
      // Playhead.
      g.fillStyle = "#ff3b3b";
      g.fillRect(w / 2 - 1, 0, 2, h);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [decks, zoom]);
  return <canvas ref={canvas} className="studio-waves" aria-hidden="true" />;
}

/** The whole track at a glance; tap to jump. */
export function DeckOverview({ deck }: { deck: StudioDeck }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    let drawnFor: unknown = null;
    let image: ImageData | null = null;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const el = canvas.current;
      const track = deck.track;
      if (!el) return;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      // Hidden (the video decks are showing): nothing to draw until it's back.
      if (!w || !h) return;
      const g = el.getContext("2d");
      if (!g) return;
      if (
        el.width !== Math.round(w * dpr) ||
        el.height !== Math.round(h * dpr) ||
        drawnFor !== track
      ) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
        drawnFor = track;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        if (track) {
          const wave = track.wave;
          const per = wave.peak.length / w;
          for (const band of BANDS) {
            const values = wave[band.key];
            g.fillStyle = band.color;
            for (let x = 0; x < w; x++) {
              let v = 0;
              for (let b = Math.floor(x * per); b < Math.floor((x + 1) * per); b++)
                if (values[b] > v) v = values[b];
              g.fillRect(x, h / 2 - (v * h) / 2, 1, Math.max(1, v * h));
            }
          }
        }
        image = g.getImageData(0, 0, el.width, el.height);
      }
      if (image) g.putImageData(image, 0, 0);
      if (!track) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const x = (deck.position / deck.duration) * w;
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(0, 0, x, h);
      g.fillStyle = "#ff3b3b";
      g.fillRect(x - 1, 0, 2, h);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [deck]);
  return (
    <canvas
      ref={canvas}
      className="studio-overview"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (deck.duration) deck.seek(((e.clientX - r.left) / r.width) * deck.duration);
      }}
    />
  );
}
