import { useSyncExternalStore } from "react";
import { readMusicPreference, writeMusicPreference } from "../preferences";
import {
  cleanMix,
  soundById,
  type AnySoundDef,
  type BeatMode,
  type BrainwaveDef,
  type NatureDef,
  type SoundMix,
} from "./catalog";
import { fadeGain, natureSamples, noiseSamples } from "./generators";

/**
 * The Moods & Sounds mixer: one Web Audio graph for the whole app, so a mix keeps playing while
 * the viewer moves between hubs and plays music on top. Each layer is its own sub-graph into a
 * master gain; the sleep timer fades the master out, a focus session chimes at its end.
 */

export type SoundsState = {
  playing: boolean;
  mix: SoundMix;
  master: number;
  /** Sleep timer: when it ends (epoch ms), and its length in minutes. */
  sleep: { endsAt: number; minutes: number } | null;
  /** Focus session: when it ends (epoch ms), and its length in minutes. */
  focus: { endsAt: number; minutes: number } | null;
  saved: SoundMix[];
};

const MIX_KEY = "harbor.music.sounds.mix.v1";
const SAVED_KEY = "harbor.music.sounds.saved.v1";
const MASTER_KEY = "harbor.music.sounds.master.v1";
const LOOP_SECONDS = 8;
const FADE_OUT_SECONDS = 60;
const RAMP = 0.08;
/** Pure tones are much louder than noise at the same gain. */
const TONE_LEVEL = 0.22;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = readMusicPreference(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

let state: SoundsState = {
  playing: false,
  mix: cleanMix(readJson<SoundMix>(MIX_KEY, { name: "My mix", layers: [], beatMode: "binaural" })),
  master: Math.min(1, Math.max(0, Number(readJson<number>(MASTER_KEY, 0.8)) || 0.8)),
  sleep: null,
  focus: null,
  saved: readJson<SoundMix[]>(SAVED_KEY, []).map(cleanMix).slice(0, 30),
};

const listeners = new Set<() => void>();

function set(next: Partial<SoundsState>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export function subscribeSounds(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const soundsState = (): SoundsState => state;

export function useSounds(): SoundsState {
  return useSyncExternalStore(subscribeSounds, soundsState, soundsState);
}

// ---- Web Audio graph ---------------------------------------------------------------------

type LayerGraph = { gain: GainNode; stop: () => void };

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
const graphs = new Map<string, LayerGraph>();
const buffers = new Map<string, AudioBuffer>();
let ticker: number | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    typeof window !== "undefined"
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!Ctor) return null;
  ctx = new Ctor();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(ctx.destination);
  return ctx;
}

/** A stereo loop with decorrelated channels, so noise sounds wide rather than centred. */
function loopBuffer(key: string, make: (seed: number) => Float32Array): AudioBuffer {
  const c = ctx!;
  const cached = buffers.get(key);
  if (cached && cached.sampleRate === c.sampleRate) return cached;
  const buffer = c.createBuffer(2, c.sampleRate * LOOP_SECONDS, c.sampleRate);
  buffer.copyToChannel(make(11) as Float32Array<ArrayBuffer>, 0);
  buffer.copyToChannel(make(29) as Float32Array<ArrayBuffer>, 1);
  buffers.set(key, buffer);
  return buffer;
}

function loopSource(buffer: AudioBuffer): AudioBufferSourceNode {
  const src = ctx!.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

/** A slow LFO driving `param` around its current value by ±`depth`. */
function lfo(param: AudioParam, hz: number, depth: number): OscillatorNode {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.frequency.value = hz;
  const amount = c.createGain();
  amount.gain.value = depth;
  osc.connect(amount).connect(param);
  osc.start();
  return osc;
}

function brainwaveGraph(def: BrainwaveDef, mode: BeatMode, out: GainNode): () => void {
  const c = ctx!;
  const level = c.createGain();
  level.gain.value = TONE_LEVEL;
  level.connect(out);
  if (mode === "binaural") {
    // A slightly different tone in each ear; the difference is the beat.
    const merger = c.createChannelMerger(2);
    const left = c.createOscillator();
    const right = c.createOscillator();
    left.frequency.value = def.carrierHz - def.beatHz / 2;
    right.frequency.value = def.carrierHz + def.beatHz / 2;
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    merger.connect(level);
    left.start();
    right.start();
    return () => {
      left.stop();
      right.stop();
      level.disconnect();
    };
  }
  // Isochronic: one tone pulsing on and off at the beat rate.
  const tone = c.createOscillator();
  tone.frequency.value = def.carrierHz;
  const pulse = c.createGain();
  pulse.gain.value = 0.5;
  tone.connect(pulse).connect(level);
  const mod = lfo(pulse.gain, def.beatHz, 0.5);
  tone.start();
  return () => {
    tone.stop();
    mod.stop();
    level.disconnect();
  };
}

function natureGraph(def: NatureDef, out: GainNode): () => void {
  const c = ctx!;
  const src = loopSource(
    loopBuffer(`nature:${def.bed}`, (seed) =>
      natureSamples(def.bed, c.sampleRate * LOOP_SECONDS, c.sampleRate, seed),
    ),
  );
  const filter = c.createBiquadFilter();
  const swell = c.createGain();
  swell.gain.value = 1;
  const stops: Array<() => void> = [];
  switch (def.bed) {
    case "ocean": {
      // Waves: the surf brightens and swells every ~11 seconds.
      filter.type = "lowpass";
      filter.frequency.value = 700;
      swell.gain.value = 0.65;
      const a = lfo(filter.frequency, 0.09, 450);
      const b = lfo(swell.gain, 0.09, 0.35);
      stops.push(
        () => a.stop(),
        () => b.stop(),
      );
      break;
    }
    case "wind": {
      filter.type = "bandpass";
      filter.frequency.value = 500;
      filter.Q.value = 0.8;
      swell.gain.value = 0.7;
      const a = lfo(filter.frequency, 0.05, 300);
      const b = lfo(swell.gain, 0.13, 0.3);
      stops.push(
        () => a.stop(),
        () => b.stop(),
      );
      break;
    }
    case "fire":
      filter.type = "lowpass";
      filter.frequency.value = 3500;
      break;
    case "river":
      filter.type = "lowpass";
      filter.frequency.value = 3000;
      break;
    default:
      filter.type = "allpass";
  }
  src.connect(filter).connect(swell).connect(out);
  src.start();
  if (def.bed === "thunder") {
    // Distant rolls every 15–40 seconds.
    let timer = 0;
    const roll = () => {
      if (!ctx) return;
      const now = ctx.currentTime;
      const rumble = loopSource(
        loopBuffer("noise:brown", (seed) =>
          noiseSamples("brown", c.sampleRate * LOOP_SECONDS, c.sampleRate, seed),
        ),
      );
      const low = c.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 140;
      const env = c.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(1.6, now + 0.6);
      env.gain.exponentialRampToValueAtTime(0.001, now + 7);
      rumble.connect(low).connect(env).connect(out);
      rumble.start(now);
      rumble.stop(now + 7.5);
      timer = window.setTimeout(roll, 15_000 + Math.random() * 25_000);
    };
    timer = window.setTimeout(roll, 4000);
    stops.push(() => window.clearTimeout(timer));
  }
  return () => {
    src.stop();
    for (const stop of stops) stop();
    swell.disconnect();
  };
}

function buildLayer(def: AnySoundDef, volume: number, mode: BeatMode): LayerGraph {
  const c = ctx!;
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain!);
  gain.gain.setTargetAtTime(volume, c.currentTime, 0.4);
  let stop: () => void;
  if (def.kind === "brainwave") stop = brainwaveGraph(def, mode, gain);
  else if (def.kind === "nature") stop = natureGraph(def, gain);
  else {
    const src = loopSource(
      loopBuffer(`noise:${def.color}`, (seed) =>
        noiseSamples(def.color, c.sampleRate * LOOP_SECONDS, c.sampleRate, seed),
      ),
    );
    src.connect(gain);
    src.start();
    stop = () => src.stop();
  }
  return {
    gain,
    stop: () => {
      try {
        stop();
      } catch {
        // Already stopped.
      }
      gain.disconnect();
    },
  };
}

/** Bring the running graph in line with the mix: add, remove and re-level layers. */
function sync() {
  if (!ctx || !state.playing) return;
  const wanted = new Map(state.mix.layers.map((l) => [l.id, l.volume]));
  for (const [id, graph] of graphs) {
    if (wanted.has(id)) continue;
    const g = graph;
    g.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    window.setTimeout(() => g.stop(), 1500);
    graphs.delete(id);
  }
  for (const [id, volume] of wanted) {
    const existing = graphs.get(id);
    if (existing) {
      existing.gain.gain.setTargetAtTime(volume, ctx.currentTime, RAMP);
      continue;
    }
    const def = soundById(id);
    if (def) graphs.set(id, buildLayer(def, volume, state.mix.beatMode));
  }
}

function teardown() {
  for (const graph of graphs.values()) graph.stop();
  graphs.clear();
}

function masterLevel(): number {
  if (!state.sleep) return state.master;
  const remaining = (state.sleep.endsAt - Date.now()) / 1000;
  if (remaining > FADE_OUT_SECONDS) return state.master;
  return state.master * fadeGain(FADE_OUT_SECONDS - remaining, FADE_OUT_SECONDS);
}

function chime() {
  if (!ctx || !masterGain) return;
  const now = ctx.currentTime;
  for (const [hz, delay] of [
    [880, 0],
    [1320, 0.18],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now + delay);
    env.gain.linearRampToValueAtTime(0.25, now + delay + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, now + delay + 2.2);
    osc.connect(env).connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 2.4);
  }
}

function tick() {
  if (!ctx || !masterGain) return;
  const now = Date.now();
  if (state.focus && now >= state.focus.endsAt) {
    chime();
    set({ focus: null });
    stopSounds();
    return;
  }
  if (state.sleep && now >= state.sleep.endsAt) {
    set({ sleep: null });
    stopSounds();
    return;
  }
  masterGain.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.5);
}

// ---- Public controls ---------------------------------------------------------------------

function persistMix() {
  writeMusicPreference(MIX_KEY, JSON.stringify(state.mix));
}

export async function playSounds(): Promise<void> {
  const c = context();
  if (!c || !masterGain) return;
  if (c.state === "suspended") await c.resume().catch(() => {});
  set({ playing: true });
  sync();
  masterGain.gain.setTargetAtTime(masterLevel(), c.currentTime, 0.6);
  if (ticker === null) ticker = window.setInterval(tick, 1000);
}

export function stopSounds(): void {
  set({ playing: false, sleep: null });
  if (ticker !== null) {
    window.clearInterval(ticker);
    ticker = null;
  }
  if (!ctx || !masterGain) return;
  masterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  window.setTimeout(() => {
    if (!state.playing) teardown();
  }, 1600);
}

export function toggleSounds(): void {
  if (state.playing) stopSounds();
  else void playSounds();
}

/** Turn a sound on (at `volume`) or off. Starts playback when the first sound is added. */
export function toggleLayer(id: string, volume = 0.5): void {
  const has = state.mix.layers.some((l) => l.id === id);
  const layers = has
    ? state.mix.layers.filter((l) => l.id !== id)
    : [...state.mix.layers, { id, volume }];
  set({ mix: cleanMix({ ...state.mix, layers }) });
  persistMix();
  if (!state.mix.layers.length) stopSounds();
  else if (!state.playing && !has) void playSounds();
  else sync();
}

export function setLayerVolume(id: string, volume: number): void {
  const layers = state.mix.layers.map((l) => (l.id === id ? { ...l, volume } : l));
  set({ mix: cleanMix({ ...state.mix, layers }) });
  persistMix();
  sync();
}

export function setBeatMode(beatMode: BeatMode): void {
  if (beatMode === state.mix.beatMode) return;
  set({ mix: { ...state.mix, beatMode } });
  persistMix();
  // Brainwave layers rebuild in the new mode.
  for (const layer of state.mix.layers) {
    if (soundById(layer.id)?.kind !== "brainwave") continue;
    const graph = graphs.get(layer.id);
    if (graph) {
      graph.stop();
      graphs.delete(layer.id);
    }
  }
  sync();
}

export function setMasterVolume(master: number): void {
  set({ master: Math.min(1, Math.max(0, master)) });
  writeMusicPreference(MASTER_KEY, JSON.stringify(state.master));
  if (ctx && masterGain && state.playing)
    masterGain.gain.setTargetAtTime(masterLevel(), ctx.currentTime, RAMP);
}

/** Replace the mix (a preset, a saved mix or a vibe's sounds) and play it. */
export function loadMix(mix: SoundMix): void {
  const next = cleanMix(mix);
  const modeChanged = next.beatMode !== state.mix.beatMode;
  set({ mix: next });
  persistMix();
  if (modeChanged) teardown();
  if (next.layers.length) void playSounds();
  else stopSounds();
}

export function clearMix(): void {
  loadMix({ ...state.mix, name: "My mix", layers: [] });
}

/** Fade out and stop after `minutes`; 0 turns the timer off. */
export function setSleepTimer(minutes: number): void {
  set({ sleep: minutes > 0 ? { endsAt: Date.now() + minutes * 60_000, minutes } : null });
}

/** A focus session: play for `minutes`, then a gentle chime and stop; 0 cancels it. */
export function startFocus(minutes: number): void {
  set({ focus: minutes > 0 ? { endsAt: Date.now() + minutes * 60_000, minutes } : null });
  if (minutes > 0 && !state.playing && state.mix.layers.length) void playSounds();
}

export function saveCurrentMix(name: string): void {
  const mix = cleanMix({ ...state.mix, name: name.trim() || "My mix" });
  if (!mix.layers.length) return;
  const saved = [mix, ...state.saved.filter((m) => m.name !== mix.name)].slice(0, 30);
  set({ saved, mix });
  writeMusicPreference(SAVED_KEY, JSON.stringify(saved));
  persistMix();
}

export function deleteSavedMix(name: string): void {
  const saved = state.saved.filter((m) => m.name !== name);
  set({ saved });
  writeMusicPreference(SAVED_KEY, JSON.stringify(saved));
}
