import type { IptvChannel } from "../iptv/types";
import type { SportsGame } from "./espn-types";

/**
 * The Sports Hub's own search: sports only, never movies or shows. Games and channels match
 * instantly from what the hub has already loaded; teams and players come from ESPN as the
 * viewer types (people.ts). Plain module, no I/O.
 */

/** Lowercase, accents and punctuation folded, so "Atlético" finds "atletico". */
export function foldSports(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(q: string): string[] {
  return foldSports(q).split(" ").filter(Boolean);
}

/** How well a text matches every word typed: 0 for no match, higher is better. */
export function matchScore(text: string, query: string): number {
  const hay = foldSports(text);
  const parts = words(query);
  if (!parts.length || !hay) return 0;
  let score = 0;
  for (const w of parts) {
    const at = hay.indexOf(w);
    if (at < 0) return 0;
    // A word that starts a name beats one in the middle of it.
    score += at === 0 || hay[at - 1] === " " ? 3 : 1;
  }
  if (hay === foldSports(query)) score += 5;
  return score;
}

function gameText(g: SportsGame): string {
  return [
    g.home.name,
    g.home.abbr,
    g.away.name,
    g.away.abbr,
    g.league,
    g.headline ?? "",
    ...(g.broadcasts ?? []),
  ].join(" ");
}

/** Games for a query: live first, then the soonest, best match within each. */
export function searchGames(games: readonly SportsGame[], query: string, limit = 12): SportsGame[] {
  const seen = new Set<string>();
  const hits: { g: SportsGame; s: number }[] = [];
  for (const g of games) {
    const key = `${g.league}:${g.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = matchScore(gameText(g), query);
    if (s) hits.push({ g, s });
  }
  const rank = (g: SportsGame) => (g.state === "in" ? 0 : g.state === "pre" ? 1 : 2);
  return hits
    .sort((a, b) => rank(a.g) - rank(b.g) || b.s - a.s || a.g.startMs - b.g.startMs)
    .slice(0, limit)
    .map((h) => h.g);
}

/** Sports channels for a query, best match first; channels the viewer hid are left out. */
export function searchChannels(
  channels: readonly IptvChannel[],
  query: string,
  isSports: (name: string, group: string | null) => boolean,
  hidden: (name: string) => boolean = () => false,
  limit = 20,
): IptvChannel[] {
  const hits: { c: IptvChannel; s: number }[] = [];
  for (const c of channels) {
    if (!c.name || !isSports(c.name, c.group) || hidden(c.name)) continue;
    const s = matchScore(`${c.name} ${c.group ?? ""}`, query);
    if (s) hits.push({ c, s });
  }
  return hits
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((h) => h.c);
}

/** A sports channel prepared for searching: its folded name and group, worked out once. */
export type SportsChannelEntry = { channel: IptvChannel; text: string };

/**
 * Picks the sports channels out of a playlist once, in small slices so the page keeps answering
 * the remote while a large list (tens of thousands of channels) is sorted. Each key typed then
 * searches only this short list. Resolves null when stopped.
 */
export async function buildSportsChannelIndex(
  channels: readonly IptvChannel[],
  isSports: (name: string, group: string | null) => boolean,
  options: { slice?: number; yieldTo?: () => Promise<void>; stopped?: () => boolean } = {},
): Promise<SportsChannelEntry[] | null> {
  const slice = options.slice ?? 1500;
  const yieldTo = options.yieldTo ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  const out: SportsChannelEntry[] = [];
  for (let at = 0; at < channels.length; at += slice) {
    if (options.stopped?.()) return null;
    const end = Math.min(channels.length, at + slice);
    for (let i = at; i < end; i++) {
      const c = channels[i];
      if (c.name && isSports(c.name, c.group)) {
        out.push({ channel: c, text: foldSports(`${c.name} ${c.group ?? ""}`) });
      }
    }
    if (end < channels.length) await yieldTo();
  }
  return out;
}

/** Sports channels for a query from a prepared index; channels the viewer hid are left out. */
export function searchChannelIndex(
  index: readonly SportsChannelEntry[],
  query: string,
  hidden: (name: string) => boolean = () => false,
  limit = 20,
): IptvChannel[] {
  const parts = words(query);
  if (!parts.length) return [];
  const whole = foldSports(query);
  const hits: { c: IptvChannel; s: number }[] = [];
  for (const { channel, text } of index) {
    let score = 0;
    for (const w of parts) {
      const at = text.indexOf(w);
      if (at < 0) {
        score = 0;
        break;
      }
      score += at === 0 || text[at - 1] === " " ? 3 : 1;
    }
    if (!score || hidden(channel.name)) continue;
    if (text === whole) score += 5;
    hits.push({ c: channel, s: score });
  }
  return hits
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((h) => h.c);
}
