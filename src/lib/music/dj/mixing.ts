/**
 * The AI DJ's mixing brain: harmonic mixing on the Camelot wheel, set order for key and tempo
 * flow, phrase-timed transitions, and the shape of each transition. The decks are YouTube
 * players, so everything here works with timing and volume alone. Plain module, no I/O.
 */

export type Camelot = { n: number; letter: "A" | "B" };
export type Match = "same" | "neighbour" | "relative" | "boost" | "clash";
export type TransitionStyle = "blend" | "cut" | "chop" | "fade";
export type MixSong = { bpm?: number; key?: string; energy?: number };

export function parseKey(key: string | undefined): Camelot | null {
  const m = /^(1[0-2]|[1-9])([AB])$/.exec(key ?? "");
  return m ? { n: Number(m[1]), letter: m[2] as "A" | "B" } : null;
}

/** Steps around the wheel from a to b (-6..6). */
function steps(a: number, b: number): number {
  const d = (((b - a) % 12) + 12) % 12;
  return d > 6 ? d - 12 : d;
}

/** How two keys sit together on the Camelot wheel. */
export function keyMatch(from: string | undefined, to: string | undefined): Match | null {
  const a = parseKey(from);
  const b = parseKey(to);
  if (!a || !b) return null;
  const d = steps(a.n, b.n);
  if (d === 0) return a.letter === b.letter ? "same" : "relative";
  if (a.letter === b.letter && Math.abs(d) === 1) return "neighbour";
  // +2 on the same letter (or +7 semitones) is the classic energy boost.
  if (a.letter === b.letter && d === 2) return "boost";
  return "clash";
}

export const MATCH_LABEL: Record<Match, string> = {
  same: "Perfect key match",
  neighbour: "Harmonic match",
  relative: "Relative key: mood shift",
  boost: "Energy boost",
  clash: "Key change",
};

const matchCost: Record<Match, number> = {
  same: 0,
  neighbour: 0.5,
  relative: 0.8,
  boost: 1.2,
  clash: 4,
};

/** How hard it is to go from one song to the next: key distance plus tempo jump. */
export function mixCost(a: MixSong, b: MixSong): number {
  const m = keyMatch(a.key, b.key);
  const key = m ? matchCost[m] : 1.5;
  const tempo =
    a.bpm && b.bpm
      ? Math.min(
          Math.abs(a.bpm - b.bpm),
          Math.abs(a.bpm - b.bpm * 2),
          Math.abs(a.bpm * 2 - b.bpm),
        ) / a.bpm
      : 0.05;
  const energy = a.energy && b.energy ? Math.max(0, Math.abs(b.energy - a.energy) - 2) * 0.4 : 0;
  return key + tempo * 12 + energy;
}

/**
 * Order the coming songs so each flows into the next (greedy from the song on). Songs the AI
 * gave no key or tempo for keep their place at the end.
 */
export function harmonicOrder<T extends MixSong>(from: MixSong | undefined, songs: T[]): T[] {
  const known = songs.filter((s) => s.key || s.bpm);
  const unknown = songs.filter((s) => !(s.key || s.bpm));
  if (!from || known.length < 2) return songs;
  const out: T[] = [];
  let last: MixSong = from;
  const left = [...known];
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++)
      if (mixCost(last, left[i]) < mixCost(last, left[best]) - 0.01) best = i;
    const [next] = left.splice(best, 1);
    out.push(next);
    last = next;
  }
  return [...out, ...unknown];
}

/** The transition that suits two songs. */
export function transitionStyle(a: MixSong, b: MixSong): TransitionStyle {
  const tempoJump = a.bpm && b.bpm ? Math.abs(a.bpm - b.bpm) / a.bpm : 0;
  if (a.energy && b.energy && b.energy <= a.energy - 3) return "fade";
  if (tempoJump > 0.15) return "cut";
  if (keyMatch(a.key, b.key) === "clash") return "chop";
  return "blend";
}

export const STYLE_LABEL: Record<TransitionStyle, string> = {
  blend: "Blend",
  cut: "Cut on the phrase",
  chop: "Beat chop",
  fade: "Fade down",
};

/**
 * When the transition starts and how long it runs: on a 32-beat phrase boundary, long enough
 * for 16 beats of blend (4 for a cut, 8 for a chop), finishing before the last few seconds.
 * Without a tempo it falls back to the old fixed 8-second fade at the end.
 */
export function phrasePlan(
  bpm: number | undefined,
  duration: number,
  style: TransitionStyle,
): { start: number; seconds: number; beats: number } {
  if (!bpm || !(duration > 30)) return { start: Math.max(0, duration - 8), seconds: 8, beats: 0 };
  const beat = 60 / bpm;
  const beats = style === "cut" ? 4 : style === "chop" ? 8 : 16;
  const seconds = Math.min(16, Math.max(2, beats * beat));
  const phrase = 32 * beat;
  const latest = duration - 3 - seconds;
  const start = Math.max(phrase, Math.floor(latest / phrase) * phrase);
  return { start: Math.min(start, Math.max(0, latest)), seconds, beats };
}

/**
 * Deck gains at progress t (0-1) through a transition. A blend is an equal-power crossfade; a
 * cut holds the old song then swaps fast; a chop gates the outgoing song on the beat while the
 * new one rises; a fade lets the old song sink before the new one comes up.
 */
export function transitionGains(
  style: TransitionStyle,
  t: number,
  beatPhase: number,
): [number, number] {
  const x = Math.min(1, Math.max(0, t));
  const out = Math.cos((x * Math.PI) / 2);
  const inn = Math.sin((x * Math.PI) / 2);
  if (style === "cut")
    return x < 0.75 ? [1, 0] : [Math.max(0, 1 - (x - 0.75) * 8), Math.min(1, (x - 0.75) * 4)];
  if (style === "chop") {
    const gate = beatPhase % 1 < 0.5 ? 1 : 0.15;
    return [out * gate, inn];
  }
  if (style === "fade")
    return [Math.max(0, 1 - x * 1.6), x < 0.4 ? 0 : Math.sin(((x - 0.4) / 0.6) * (Math.PI / 2))];
  return [out, inn];
}
