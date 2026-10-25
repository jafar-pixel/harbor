/**
 * AI DJ vibes and the pure helpers around a DJ set: presets, matching a YouTube result to a
 * song, and the crossfade curve. Plain data and functions, no I/O.
 */

export type Vibe = {
  id: string;
  name: string;
  /** What the DJ is told; a typed vibe uses the listener's own words. */
  prompt: string;
  colors: [string, string];
};

export const VIBES: readonly Vibe[] = [
  {
    id: "hawaii-jazz",
    name: "Smooth jazz on a Hawaii beach",
    prompt: "Smooth jazz sitting on the beach in Hawaii at sunset",
    colors: ["#f97316", "#0e7490"],
  },
  {
    id: "marley-hawaii",
    name: "Bob Marley in Hawaii",
    prompt: "Bob Marley and island reggae, a laid-back Hawaii afternoon",
    colors: ["#16a34a", "#facc15"],
  },
  {
    id: "golden-era",
    name: "Golden-era hip-hop",
    prompt: "90s boom bap and golden-era hip-hop, head-nodding beats",
    colors: ["#dc2626", "#1f2937"],
  },
  {
    id: "sunday-gospel",
    name: "Sunday morning gospel",
    prompt: "Uplifting Sunday morning gospel, choirs and contemporary praise",
    colors: ["#fde68a", "#7c3aed"],
  },
  {
    id: "late-drive",
    name: "Late-night drive",
    prompt: "Late-night city drive, smooth R&B and neo-soul",
    colors: ["#6366f1", "#0f172a"],
  },
  {
    id: "game-day",
    name: "Game day hype",
    prompt: "Game day hype, high-energy hip-hop and stadium anthems to get pumped",
    colors: ["#ef4444", "#f59e0b"],
  },
  {
    id: "rainy-cafe",
    name: "Rainy café",
    prompt: "A rainy afternoon in a café, mellow jazz and bossa nova",
    colors: ["#78716c", "#1e3a8a"],
  },
  {
    id: "classic-rock-bbq",
    name: "Backyard BBQ",
    prompt: "Backyard BBQ with family, classic soul, funk and feel-good rock",
    colors: ["#ea580c", "#65a30d"],
  },
  {
    id: "afro-island",
    name: "Afrobeats & island heat",
    prompt: "Summer party with Afrobeats, amapiano and dancehall",
    colors: ["#f43f5e", "#14b8a6"],
  },
];

export type DjSong = { artist: string; title: string; why: string };

export type VideoResult = {
  id: string;
  title: string;
  channel: string;
  thumb: string;
  publishedAt?: string;
};

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Uploads that aren't the recording: covers, live takes, karaoke, reactions, lessons. */
const NOT_THE_SONG =
  /\b(cover|karaoke|instrumental|reaction|reacts|lesson|tutorial|how to play|8d|slowed|sped up|nightcore|remix|live at|live from|live in|piano version|drum cover|bass cover)\b/;

/**
 * The best video for a song from search results: the title must name the song, the artist
 * should appear in the title or channel, and official uploads win. Null when nothing fits.
 */
export function pickVideo(song: DjSong, results: readonly VideoResult[]): VideoResult | null {
  const title = fold(song.title);
  const artist = fold(song.artist.replace(/\s*&\s*the\s+\w+$/i, ""));
  const wantsVariant = NOT_THE_SONG.test(title);
  let best: { r: VideoResult; score: number } | null = null;
  results.forEach((r, i) => {
    const t = fold(r.title);
    const ch = fold(r.channel);
    if (!t.includes(title)) return;
    if (!wantsVariant && NOT_THE_SONG.test(t)) return;
    let score = 10 - i;
    if (t.includes(artist) || ch.includes(artist)) score += 20;
    if (/\b(official|vevo)\b/.test(t) || /vevo|topic|official/.test(ch)) score += 10;
    if (ch.replace(/ /g, "").includes(artist.replace(/ /g, ""))) score += 8;
    // The DJ shows videos, so a music video beats a still-image audio upload.
    if (/\b(official video|music video|official music video)\b/.test(t)) score += 6;
    if (!best || score > best.score) best = { r, score };
  });
  return best ? (best as { r: VideoResult }).r : null;
}

/** The search for a song's video. */
export const songQuery = (song: DjSong) => `${song.artist} - ${song.title}`;

/** A song's identity for "avoid" lists and dedupe. */
export const songKey = (song: Pick<DjSong, "artist" | "title">) => `${song.artist} - ${song.title}`;

/** Equal-power crossfade gains (out, in) at `progress` 0–1 through the fade. */
export function crossfade(progress: number): [number, number] {
  const p = Math.min(1, Math.max(0, progress));
  return [Math.cos((p * Math.PI) / 2), Math.sin((p * Math.PI) / 2)];
}
