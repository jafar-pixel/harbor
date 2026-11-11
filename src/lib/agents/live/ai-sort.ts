import { claudeText } from "@/lib/claude";
import type { IptvChannel } from "@/lib/iptv/types";
import { genreByRules, LIVE_GENRES, type LiveGenre, type LiveLabel } from "./genre";
import { hasLiveLabel, liveNameKey, saveLiveLabels } from "./store";

/**
 * The Live TV agent's Claude step: channel names the rules can't place go to Claude with the
 * viewer's own Anthropic key, in batches, and every answer is saved so a name is only ever asked
 * about once. A run sorts at most RUN_LIMIT names, so one press never runs up a large bill; the
 * viewer can press again for the next ones.
 */

const BATCH = 120;
export const RUN_LIMIT = 1200;

const SYSTEM = `You sort a viewer's IPTV channel names for a live TV app.
For each channel (its name, and the provider's group after "|"), say what kind of channel it is:
"news", "kids", "movies" (movie channels and premium film networks), "entertainment" (general
entertainment, drama and comedy networks), "documentary" (factual, nature, history, science),
"lifestyle" (home, food, travel, reality), "music", "spanish" (Spanish-language channels),
"faith", "local" (a local over-the-air station), "sports", "adult", or "other" when you can't tell.
Also give "brand": the channel's own name without the provider's country tags, quality tags or
numbers ("USA HGTV FHD" -> "HGTV"), or null if unclear. Never guess a genre for a name you don't
recognise; use "other". Reply with JSON only.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["channels"],
  properties: {
    channels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "genre", "brand"],
        properties: {
          i: { type: "integer" },
          genre: { type: "string", enum: [...LIVE_GENRES] },
          brand: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
};

type Pending = { name: string; group: string | null };

/** The channels Claude would be asked about: unplaced by the rules and not yet answered. */
export function liveNamesForClaude(channels: readonly IptvChannel[]): Pending[] {
  const out = new Map<string, Pending>();
  for (const c of channels) {
    if (!c.name) continue;
    const key = liveNameKey(c.name);
    if (out.has(key) || hasLiveLabel(c.name) || genreByRules(c.name, c.group)) continue;
    out.set(key, { name: c.name, group: c.group ?? null });
  }
  return [...out.values()];
}

/** Turns one answer row into a label, keeping only well-formed fields. */
export function liveLabelFromAnswer(row: Record<string, unknown>): LiveLabel {
  const genre = (LIVE_GENRES as readonly string[]).includes(row.genre as string)
    ? (row.genre as LiveGenre)
    : "other";
  const brand =
    typeof row.brand === "string" && row.brand.trim() ? row.brand.trim().slice(0, 60) : undefined;
  return { genre, brand, by: "ai" };
}

export type LiveSortProgress = { done: number; total: number };

/** Sorts up to RUN_LIMIT unplaced names with Claude and saves the answers. */
export async function sortLiveWithClaude(
  account: { key: string; model: string },
  channels: readonly IptvChannel[],
  onProgress?: (p: LiveSortProgress) => void,
  signal?: AbortSignal,
): Promise<number> {
  const pending = liveNamesForClaude(channels).slice(0, RUN_LIMIT);
  let done = 0;
  onProgress?.({ done, total: pending.length });
  for (let at = 0; at < pending.length; at += BATCH) {
    signal?.throwIfAborted();
    const batch = pending.slice(at, at + BATCH);
    const raw = await claudeText({
      ...account,
      system: SYSTEM,
      user: batch.map((p, i) => `${i}. ${p.name}${p.group ? ` | ${p.group}` : ""}`).join("\n"),
      schema: SCHEMA,
      maxTokens: 16000,
      signal,
    });
    let rows: unknown = [];
    try {
      rows = (JSON.parse(raw) as { channels?: unknown }).channels ?? [];
    } catch {
      rows = [];
    }
    const found: Record<string, LiveLabel> = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const r = (row ?? {}) as Record<string, unknown>;
      const p = batch[Number(r.i)];
      if (p) found[liveNameKey(p.name)] = liveLabelFromAnswer(r);
    }
    // Names Claude skipped count as asked, so they aren't sent again.
    for (const p of batch) found[liveNameKey(p.name)] ??= { genre: "other", by: "ai" };
    saveLiveLabels(found);
    done += batch.length;
    onProgress?.({ done, total: pending.length });
  }
  return done;
}
