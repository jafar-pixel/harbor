import { claudeText } from "@/lib/claude";
import type { DjAsk, DjSet } from "./api";
import type { DjSong } from "./vibes";

/**
 * Ask JL / the AI DJ on Claude with the listener's own Anthropic key. Same rules, limits and
 * answer as the music-dj edge function (supabase/functions/music-dj), which runs JL's hosted
 * model for everyone without a key; keep the two in step.
 */

const SOUNDS = [
  "delta",
  "theta",
  "alpha",
  "beta",
  "gamma",
  "white",
  "pink",
  "brown",
  "green",
  "blue",
  "violet",
  "rain",
  "ocean",
  "wind",
  "river",
  "fire",
  "thunder",
];

const SYSTEM = `You are the JL Media Vision AI DJ. You build listening sessions from real, released songs that are on YouTube.
Rules:
- Only suggest songs that really exist, by the artist who recorded them. Never invent titles.
- Keep the vibe; flow from one song to the next (energy, tempo, key, era) like a DJ set.
- Mix in artists the listener knows with similar ones they may not, across one genre or blending genres when the vibe calls for it.
- No repeats, and skip anything in "avoid".
- Give exactly the number of tracks asked for.
- "discover" is 3 artists new to this listener that fit, each with one song to start on.
- "scene" describes a background video for the vibe (a place or mood, e.g. "Hawaii beach sunset waves 4k"), with no people or brands.
- "colors" are two hex colours for the vibe.
- "sounds" are 0-2 background sounds from this list that suit the vibe, or none for a party: ${SOUNDS.join(", ")}.
- "intro" is one or two short, warm DJ lines (under 200 characters).
- Mix like a club DJ. For every track give "bpm" (its tempo, a whole number), "key" (its musical key as a Camelot code, 1A-12B) and "energy" (1-10). Order the set for harmonic mixing: each next track in the same key, one step around the wheel (8A to 7A or 9A) or the relative key (8A to 8B), with bpm within about 8% of the last unless the vibe calls for a change; build energy in waves, not all at once.
Reply with JSON only.`;

const ANALYZE = `You know music deeply. For each song give its tempo in BPM (a whole number), its musical key as a Camelot code (1A-12B) and its energy (1-10), as published or as a DJ would measure it. Use your best estimate when unsure; never skip a song.
Reply with JSON only, where "i" is the song's number in the list.`;

const strictObject = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const TRACK = strictObject({
  artist: { type: "string" },
  title: { type: "string" },
  why: { type: "string" },
  bpm: { type: "integer" },
  key: { type: "string" },
  energy: { type: "integer" },
});

const SET_SCHEMA = strictObject({
  intro: { type: "string" },
  tracks: { type: "array", items: TRACK },
  discover: {
    type: "array",
    items: strictObject({
      artist: { type: "string" },
      title: { type: "string" },
      why: { type: "string" },
    }),
  },
  scene: { type: "string" },
  colors: { type: "array", items: { type: "string" } },
  sounds: { type: "array", items: { type: "string", enum: SOUNDS } },
});

const ANALYZE_SCHEMA = strictObject({
  songs: {
    type: "array",
    items: strictObject({
      i: { type: "integer" },
      bpm: { type: "integer" },
      key: { type: "string" },
      energy: { type: "integer" },
    }),
  },
});

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number, len: number) =>
  Array.isArray(v)
    ? v
        .map((x) => text(x, len))
        .filter(Boolean)
        .slice(0, max)
    : [];

/** Tempo, Camelot key and energy, each only when it is in range. */
function facts(o: Record<string, unknown>) {
  const bpm = Math.round(Number(o.bpm));
  const key = text(o.key, 3).toUpperCase();
  const energy = Math.round(Number(o.energy));
  return {
    ...(bpm >= 50 && bpm <= 220 ? { bpm } : {}),
    ...(/^(1[0-2]|[1-9])[AB]$/.test(key) ? { key } : {}),
    ...(energy >= 1 && energy <= 10 ? { energy } : {}),
  };
}

function parse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    throw new Error("The DJ's answer couldn't be read.");
  }
}

/** The DJ's answer held to the same limits as the edge function's. */
export function cleanDjSet(raw: Record<string, unknown>, ask: DjAsk, count: number): DjSet {
  const song = (v: unknown): DjSong | null => {
    const o = (v ?? {}) as Record<string, unknown>;
    const artist = text(o.artist, 80);
    const title = text(o.title, 120);
    if (!artist || !title) return null;
    return { artist, title, why: text(o.why, 160), ...facts(o) };
  };
  const seen = new Set(list(ask.avoid, 200, 120).map((a) => a.toLowerCase()));
  const tracks = (Array.isArray(raw.tracks) ? raw.tracks : [])
    .map(song)
    .filter((t): t is DjSong => {
      if (!t) return false;
      const k = `${t.artist} - ${t.title}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, count);
  const discover = (Array.isArray(raw.discover) ? raw.discover : [])
    .map(song)
    .filter((t): t is DjSong => !!t)
    .slice(0, 5);
  const colors = list(raw.colors, 2, 7).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  const sounds = list(raw.sounds, 2, 12).filter((s) => SOUNDS.includes(s));
  return {
    intro: text(raw.intro, 240),
    tracks,
    discover,
    scene: text(raw.scene, 120),
    colors: colors.length === 2 ? [colors[0], colors[1]] : null,
    sounds,
  };
}

/** What the listener asked for, as the edge function words it for the model. */
export function djPrompt(ask: DjAsk): { user: string; count: number } {
  const vibe = text(ask.vibe, 200);
  const request = text(ask.request, 200);
  const styles = list(ask.styles, 20, 60);
  const seeds = list(ask.seeds, 30, 60);
  const recent = list(ask.recent, 30, 120);
  const avoid = list(ask.avoid, 200, 120);
  const count = Math.min(30, Math.max(5, Number(ask.count) || 12));
  if (!vibe && !request && !styles.length && !seeds.length)
    throw new Error("Tell the DJ a vibe or pick some styles first.");
  const user = [
    vibe && `Vibe: ${vibe}`,
    request && `Request: ${request}`,
    styles.length && `Styles they listen to: ${styles.join("; ")}`,
    seeds.length && `Artists they like: ${seeds.join("; ")}`,
    recent.length && `Recently played: ${recent.join("; ")}`,
    avoid.length && `Avoid (already played): ${avoid.join("; ")}`,
    `Number of tracks: ${count}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { user, count };
}

export async function askClaudeDj(account: { key: string; model: string }, ask: DjAsk) {
  const { user, count } = djPrompt(ask);
  const raw = await claudeText({
    ...account,
    system: SYSTEM,
    user,
    schema: SET_SCHEMA,
    // A 30-track set with reasons, plus Claude's thinking.
    maxTokens: 16000,
  });
  return cleanDjSet(parse(raw), ask, count);
}

export type AnalyzedSong = {
  artist: string;
  title: string;
  bpm?: number;
  key?: string;
  energy?: number;
};

export async function analyzeWithClaude(
  account: { key: string; model: string },
  items: { artist: string; title: string }[],
): Promise<AnalyzedSong[]> {
  const songs = items
    .slice(0, 50)
    .map((o) => ({ artist: text(o.artist, 80), title: text(o.title, 120) }))
    .filter((s) => s.title);
  if (!songs.length) return [];
  const raw = await claudeText({
    ...account,
    system: ANALYZE,
    user: songs.map((s, i) => `${i}. ${s.artist} - ${s.title}`).join("\n"),
    schema: ANALYZE_SCHEMA,
  });
  const out = parse(raw).songs;
  return (Array.isArray(out) ? out : []).flatMap((v) => {
    const o = (v ?? {}) as Record<string, unknown>;
    const song = songs[Number(o.i)];
    return song ? [{ ...song, ...facts(o) }] : [];
  });
}
