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
