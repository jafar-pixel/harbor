/**
 * Moods & Sounds: everything the app can generate itself, with no music service. Brainwave
 * beats, noise colours and synthesised nature beds, layered in a mixer. Plain data, no I/O.
 * Described as relaxation and focus aids only; nothing here makes a health claim.
 */

export type SoundKind = "brainwave" | "noise" | "nature";

export type NoiseColor = "white" | "pink" | "brown" | "green" | "blue" | "violet";
export type NatureBed = "rain" | "ocean" | "wind" | "river" | "fire" | "thunder";
export type BrainwaveBand = "delta" | "theta" | "alpha" | "beta" | "gamma";

export type SoundDef = {
  id: string;
  kind: SoundKind;
  name: string;
  blurb: string;
  /** Accent for the tile, as a CSS colour. */
  tint: string;
};

export type BrainwaveDef = SoundDef & {
  kind: "brainwave";
  band: BrainwaveBand;
  /** The beat frequency in Hz, inside the band's range. */
  beatHz: number;
  range: [number, number];
  /** The carrier tone the beat rides on, in Hz. */
  carrierHz: number;
};

export type NoiseDef = SoundDef & { kind: "noise"; color: NoiseColor };
export type NatureDef = SoundDef & { kind: "nature"; bed: NatureBed };
export type AnySoundDef = BrainwaveDef | NoiseDef | NatureDef;

export const BRAINWAVES: readonly BrainwaveDef[] = [
  {
    id: "delta",
    kind: "brainwave",
    band: "delta",
    name: "Delta",
    blurb: "Deep sleep",
    beatHz: 2,
    range: [1, 4],
    carrierHz: 136,
    tint: "#4f46e5",
  },
  {
    id: "theta",
    kind: "brainwave",
    band: "theta",
    name: "Theta",
    blurb: "Meditation, dreamy calm",
    beatHz: 6,
    range: [4, 8],
    carrierHz: 160,
    tint: "#7c3aed",
  },
  {
    id: "alpha",
    kind: "brainwave",
    band: "alpha",
    name: "Alpha",
    blurb: "Relaxed focus, unwinding",
    beatHz: 10,
    range: [8, 13],
    carrierHz: 200,
    tint: "#0ea5e9",
  },
  {
    id: "beta",
    kind: "brainwave",
    band: "beta",
    name: "Beta",
    blurb: "Alert, studying, working",
    beatHz: 18,
    range: [13, 30],
    carrierHz: 220,
    tint: "#f59e0b",
  },
  {
    id: "gamma",
    kind: "brainwave",
    band: "gamma",
    name: "Gamma",
    blurb: "High concentration",
    beatHz: 40,
    range: [30, 50],
    carrierHz: 250,
    tint: "#ef4444",
  },
];

export const NOISES: readonly NoiseDef[] = [
  {
    id: "white",
    kind: "noise",
    color: "white",
    name: "White noise",
    blurb: "Bright, even hiss",
    tint: "#e5e7eb",
  },
  {
    id: "pink",
    kind: "noise",
    color: "pink",
    name: "Pink noise",
    blurb: "Soft, like steady rain",
    tint: "#f9a8d4",
  },
  {
    id: "brown",
    kind: "noise",
    color: "brown",
    name: "Brown noise",
    blurb: "Deep rumble, like a waterfall",
    tint: "#a16207",
  },
  {
    id: "green",
    kind: "noise",
    color: "green",
    name: "Green noise",
    blurb: "Mid-range, like nature ambience",
    tint: "#22c55e",
  },
  {
    id: "blue",
    kind: "noise",
    color: "blue",
    name: "Blue noise",
    blurb: "Airy and crisp",
    tint: "#3b82f6",
  },
  {
    id: "violet",
    kind: "noise",
    color: "violet",
    name: "Violet noise",
    blurb: "High and fizzy",
    tint: "#a855f7",
  },
];

export const NATURE: readonly NatureDef[] = [
  {
    id: "rain",
    kind: "nature",
    bed: "rain",
    name: "Rain",
    blurb: "Steady rain on the roof",
    tint: "#60a5fa",
  },
  {
    id: "ocean",
    kind: "nature",
    bed: "ocean",
    name: "Ocean waves",
    blurb: "Waves rolling on a Hawaii beach",
    tint: "#06b6d4",
  },
  {
    id: "wind",
    kind: "nature",
    bed: "wind",
    name: "Wind",
    blurb: "Breeze through the palms",
    tint: "#94a3b8",
  },
  {
    id: "river",
    kind: "nature",
    bed: "river",
    name: "River",
    blurb: "A stream over rocks",
    tint: "#14b8a6",
  },
  {
    id: "fire",
    kind: "nature",
    bed: "fire",
    name: "Fireplace",
    blurb: "A crackling fire",
    tint: "#f97316",
  },
  {
    id: "thunder",
    kind: "nature",
    bed: "thunder",
    name: "Thunderstorm",
    blurb: "Rain with distant thunder",
    tint: "#6366f1",
  },
];

export const ALL_SOUNDS: readonly AnySoundDef[] = [...BRAINWAVES, ...NOISES, ...NATURE];

export function soundById(id: string): AnySoundDef | undefined {
  return ALL_SOUNDS.find((s) => s.id === id);
}

/** One layer in the mixer: a sound at a volume (0–1). */
export type MixLayer = { id: string; volume: number };

/**
 * Brainwave beats play either as binaural beats (a slightly different tone in each ear, which
 * needs headphones) or as isochronic pulses (one tone pulsing on and off, fine on speakers).
 */
export type BeatMode = "binaural" | "isochronic";

export type SoundMix = {
  name: string;
  layers: MixLayer[];
  beatMode: BeatMode;
};

/** Ready-made mixes for the quick picks, and for vibes to start from. */
export const MOOD_PRESETS: readonly (SoundMix & { id: string; blurb: string })[] = [
  {
    id: "sleep",
    name: "Sleep",
    blurb: "Delta beats over brown noise and soft rain",
    beatMode: "binaural",
    layers: [
      { id: "delta", volume: 0.35 },
      { id: "brown", volume: 0.5 },
      { id: "rain", volume: 0.35 },
    ],
  },
  {
    id: "focus",
    name: "Deep focus",
    blurb: "Beta beats with pink noise",
    beatMode: "binaural",
    layers: [
      { id: "beta", volume: 0.3 },
      { id: "pink", volume: 0.45 },
    ],
  },
  {
    id: "meditate",
    name: "Meditate",
    blurb: "Theta beats and ocean waves",
    beatMode: "binaural",
    layers: [
      { id: "theta", volume: 0.35 },
      { id: "ocean", volume: 0.55 },
    ],
  },
  {
    id: "relax",
    name: "Unwind",
    blurb: "Alpha beats, green noise and a river",
    beatMode: "binaural",
    layers: [
      { id: "alpha", volume: 0.3 },
      { id: "green", volume: 0.3 },
      { id: "river", volume: 0.4 },
    ],
  },
  {
    id: "study",
    name: "Study",
    blurb: "Gamma pulses with white noise, no headphones needed",
    beatMode: "isochronic",
    layers: [
      { id: "gamma", volume: 0.2 },
      { id: "white", volume: 0.25 },
    ],
  },
  {
    id: "beach",
    name: "Hawaii beach",
    blurb: "Ocean waves and a breeze, with Alpha underneath",
    beatMode: "binaural",
    layers: [
      { id: "ocean", volume: 0.6 },
      { id: "wind", volume: 0.25 },
      { id: "alpha", volume: 0.2 },
    ],
  },
  {
    id: "storm",
    name: "Stormy night",
    blurb: "A thunderstorm and a fireplace",
    beatMode: "binaural",
    layers: [
      { id: "thunder", volume: 0.5 },
      { id: "fire", volume: 0.35 },
    ],
  },
];

/** A mix with unknown sounds dropped, volumes clamped and each sound at most once. */
export function cleanMix(mix: SoundMix): SoundMix {
  const seen = new Set<string>();
  const layers: MixLayer[] = [];
  for (const layer of mix.layers) {
    if (!soundById(layer.id) || seen.has(layer.id)) continue;
    seen.add(layer.id);
    const volume = Number.isFinite(layer.volume) ? Math.min(1, Math.max(0, layer.volume)) : 0.5;
    layers.push({ id: layer.id, volume });
  }
  return {
    name: (mix.name || "My mix").slice(0, 60),
    layers,
    beatMode: mix.beatMode === "isochronic" ? "isochronic" : "binaural",
  };
}
