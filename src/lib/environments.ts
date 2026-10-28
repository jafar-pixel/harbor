import { useSyncExternalStore } from "react";
import jlVisionBackdrop from "@/assets/brand/jl-vision-backdrop.webp";

/**
 * JL Media Vision Pro Environments: full-screen scenes that sit behind the whole app, like a
 * visionOS environment. Photos live in the public "environments" storage bucket so the app
 * doesn't carry them; the JL Signature particle scene ships with the app. Which one is applied,
 * favourites, recents and the ambient light are kept per device.
 */

export type EnvironmentCategory =
  | "signature"
  | "cinema"
  | "nature"
  | "luxury"
  | "travel"
  | "futuristic"
  | "sports";

export type Environment = {
  id: string;
  name: string;
  category: EnvironmentCategory;
  blurb: string;
  /** Storage file name, or a bundled image URL. */
  file?: string;
  image?: string;
  /** Light that suits the scene, used until the viewer picks one. */
  light: AmbientLight;
};

export type AmbientLight = "neutral" | "cinematic-blue" | "warm-lounge";

export const CATEGORIES: { id: EnvironmentCategory; label: string }[] = [
  { id: "signature", label: "JL Signature" },
  { id: "cinema", label: "Cinema" },
  { id: "nature", label: "Nature" },
  { id: "luxury", label: "Luxury" },
  { id: "travel", label: "Travel" },
  { id: "futuristic", label: "Futuristic" },
  { id: "sports", label: "Sports" },
];

export const ENVIRONMENTS: Environment[] = [
  {
    id: "jl-signature-waves",
    name: "JL Signature",
    category: "signature",
    blurb: "JL Media Vision's own particle waves in fiery orange and violet.",
    image: jlVisionBackdrop,
    light: "warm-lounge",
  },
  {
    id: "mountain-lake",
    name: "Mountain Lake",
    category: "nature",
    blurb: "An alpine lake at blue hour, with a lakeside deck and a fire pit.",
    file: "mountain-lake.jpg",
    light: "cinematic-blue",
  },
  {
    id: "private-cinema",
    name: "Private Cinema",
    category: "cinema",
    blurb: "A dark home theater with leather recliners and blue cove lights.",
    file: "private-cinema.jpg",
    light: "cinematic-blue",
  },
  {
    id: "tropical-terrace",
    name: "Tropical Terrace",
    category: "travel",
    blurb: "An infinity pool at golden sunset, palms and the open ocean.",
    file: "tropical-terrace.jpg",
    light: "warm-lounge",
  },
  {
    id: "spatial-room",
    name: "Spatial Room",
    category: "futuristic",
    blurb: "A white lounge in orbit, with Earth through a curved window.",
    file: "spatial-room.jpg",
    light: "neutral",
  },
  {
    id: "stadium-suite",
    name: "Stadium Suite",
    category: "sports",
    blurb: "A private suite above a packed arena under the lights.",
    file: "stadium-suite.jpg",
    light: "cinematic-blue",
  },
];

const BASE = (import.meta.env.VITE_JL_SUPABASE_URL as string | undefined) || "";

export function environmentImage(env: Environment): string {
  if (env.image) return env.image;
  return `${BASE}/storage/v1/object/public/environments/${env.file}`;
}

export const LIGHTS: { id: AmbientLight; label: string; tint: string }[] = [
  // Light washes over the room, kept faint so the Environment stays bright and clear.
  { id: "neutral", label: "Neutral", tint: "transparent" },
  { id: "cinematic-blue", label: "Cinematic Blue", tint: "rgb(40 90 210 / 0.12)" },
  { id: "warm-lounge", label: "Warm Lounge", tint: "rgb(255 140 50 / 0.1)" },
];

type State = {
  applied: string;
  light: AmbientLight | null;
  favorites: string[];
  recent: string[];
};

const KEY = "jl.environments.v1";
const DEFAULT: State = { applied: "spatial-room", light: null, favorites: [], recent: [] };
const listeners = new Set<() => void>();

function read(): State {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<State> | null;
    return v ? { ...DEFAULT, ...v } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let state = read();

function write(next: Partial<State>) {
  state = { ...state, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked: the choice lasts this session */
  }
  for (const fn of listeners) fn();
}

export function useEnvironments(): State {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

export function environmentById(id: string): Environment {
  return ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[0];
}

export function applyEnvironment(id: string) {
  write({ applied: id, recent: [id, ...state.recent.filter((r) => r !== id)].slice(0, 12) });
}

export function setAmbientLight(light: AmbientLight) {
  write({ light });
}

export function toggleFavorite(id: string) {
  write({
    favorites: state.favorites.includes(id)
      ? state.favorites.filter((f) => f !== id)
      : [id, ...state.favorites],
  });
}

/** The light in effect: the viewer's pick, or what suits the applied scene. */
export function activeLight(s: State = state): AmbientLight {
  return s.light ?? environmentById(s.applied).light;
}
