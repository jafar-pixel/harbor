import { useSyncExternalStore } from "react";
import { StudioDeck, type XfadeSide } from "./deck";

export type XfadeCurve = "smooth" | "linear" | "cut";

/**
 * The DJ Studio mixer: up to four decks into a crossfader, master volume and a limiter so the
 * mix never clips. One AudioContext for the app; it starts on the first tap (browsers and
 * WebView2 only allow sound after a gesture).
 */
class StudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  decks: StudioDeck[] = [];
  crossfader = 0;
  curve: XfadeCurve = "smooth";
  masterVolume = 0.9;
  deckCount: 2 | 4 = 2;
  private listeners = new Set<() => void>();
  private version = 0;

  get context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -1.5;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.2;
      this.master.connect(this.limiter).connect(this.ctx.destination);
      this.decks = [0, 1, 2, 3].map((i) => {
        const deck = new StudioDeck(this.ctx!, i, this.master);
        deck.subscribe(() => this.changed());
        return deck;
      });
      this.applyCrossfader();
    }
    return this.ctx;
  }

  /** Decks, creating the audio graph on first use. */
  get all(): StudioDeck[] {
    void this.context;
    return this.decks;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  snapshot = () => this.version;

  private changed() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  setCrossfader(value: number) {
    this.crossfader = Math.max(-1, Math.min(1, value));
    this.applyCrossfader();
    this.changed();
  }

  setCurve(curve: XfadeCurve) {
    this.curve = curve;
    this.applyCrossfader();
    this.changed();
  }

  setSide(deck: StudioDeck, side: XfadeSide) {
    deck.setSide(side);
    this.applyCrossfader();
  }

  setMasterVolume(value: number) {
    this.masterVolume = value;
    if (this.ctx) this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.015);
    this.changed();
  }

  setDeckCount(count: 2 | 4) {
    this.deckCount = count;
    if (count === 2) for (const deck of this.decks.slice(2)) deck.pause();
    this.changed();
  }

  /** The deck others sync to: the loudest playing deck with a tempo. */
  masterDeck(except?: StudioDeck): StudioDeck | null {
    const live = this.decks
      .slice(0, this.deckCount)
      .filter((d) => d !== except && d.playing && d.bpm);
    live.sort((a, b) => b.mix.fader - a.mix.fader);
    return live[0] ?? this.decks.find((d) => d !== except && d.bpm) ?? null;
  }

  private applyCrossfader() {
    if (!this.ctx) return;
    const [a, b] = xfadeGains(this.crossfader, this.curve);
    for (const deck of this.decks) {
      const gain = deck.side === "A" ? a : deck.side === "B" ? b : 1;
      deck.output.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.008);
    }
  }
}

/** Gains for the A and B sides at crossfader position x (-1 = all A, 1 = all B). */
export function xfadeGains(x: number, curve: XfadeCurve): [number, number] {
  const t = (Math.max(-1, Math.min(1, x)) + 1) / 2;
  if (curve === "linear") return [1 - t, t];
  if (curve === "cut") {
    // Scratch curve: both sides full across the middle, cut within the last few percent.
    return [Math.min(1, (1 - t) / 0.06), Math.min(1, t / 0.06)];
  }
  return [Math.cos((t * Math.PI) / 2), Math.sin((t * Math.PI) / 2)];
}

export const studio = new StudioEngine();

/** Re-renders on any deck or mixer change (not on playhead movement). */
export function useStudio(): StudioEngine {
  useSyncExternalStore(studio.subscribe, studio.snapshot, studio.snapshot);
  return studio;
}
