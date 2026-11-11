import { channelPlayCount } from "@/lib/iptv/channel-stats";
import type { IptvChannel } from "@/lib/iptv/types";
import { HOME_GENRES, type LiveGenre } from "./genre.ts";
import { liveEdit, liveLabel } from "./store.ts";

export type GenreRow = { genre: LiveGenre; channels: IptvChannel[] };

const ROW_MAX = 24;
const ROW_MIN = 3;

/**
 * Live TV Home's rows by kind of channel (News, Kids, Movies...), from the Live TV agent's
 * labels. Hidden channels are left out; pinned ones lead, then the ones the viewer watches most,
 * then the provider's order. Adult channels never get a row.
 */
export function liveGenreRows(channels: readonly IptvChannel[]): GenreRow[] {
  const by = new Map<LiveGenre, IptvChannel[]>();
  const seen = new Set<string>();
  for (const c of channels) {
    if (!c.name || seen.has(c.id)) continue;
    seen.add(c.id);
    const label = liveLabel(c.name, c.group);
    if (!label || !HOME_GENRES.includes(label.genre)) continue;
    if (liveEdit(c.name) === "hide") continue;
    const list = by.get(label.genre) ?? [];
    list.push(c);
    by.set(label.genre, list);
  }
  const rank = (c: IptvChannel) =>
    (liveEdit(c.name) === "pin" ? 1_000_000 : 0) + channelPlayCount(c.id);
  const rows: GenreRow[] = [];
  for (const genre of HOME_GENRES) {
    const list = by.get(genre);
    if (!list || list.length < ROW_MIN) continue;
    const sorted = list
      .map((c, i) => ({ c, i, r: rank(c) }))
      .sort((a, b) => b.r - a.r || a.i - b.i)
      .slice(0, ROW_MAX)
      .map((x) => x.c);
    rows.push({ genre, channels: sorted });
  }
  return rows;
}
