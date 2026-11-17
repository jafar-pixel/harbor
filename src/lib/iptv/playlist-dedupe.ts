/**
 * One saved playlist per provider. The same M3U link or Xtream login saved more than once (under
 * different ids, as account sync and repeated setups have done) shows up as a long list of
 * identical entries; the first is kept and later copies only lend it a guide link it lacks.
 * Plain module, no storage.
 */

type Playlist = {
  id: string;
  url: string;
  epgUrl?: string;
  kind?: "m3u" | "xtream" | "epg";
  xtream?: { server: string; username: string; password: string };
};

/** What makes two saved playlists the same provider, or null when it cannot be told. */
export function playlistKey(p: Playlist): string | null {
  const kind = p.kind ?? "m3u";
  if (kind === "xtream" && p.xtream?.server && p.xtream.username) {
    const server = p.xtream.server.trim().toLowerCase().replace(/\/+$/, "");
    return `xtream|${server}|${p.xtream.username.trim()}`;
  }
  const url = p.url?.trim();
  return url ? `${kind}|${url}` : null;
}

export function dedupePlaylists<T extends Playlist>(
  lists: T[],
): { lists: T[]; replaced: Map<string, string> } {
  const kept = new Map<string, T>();
  const out: T[] = [];
  const replaced = new Map<string, string>();
  for (const p of lists) {
    const key = playlistKey(p);
    const first = key ? kept.get(key) : undefined;
    if (!first) {
      if (key) kept.set(key, p);
      out.push(p);
      continue;
    }
    if (!first.epgUrl && p.epgUrl) {
      const merged = { ...first, epgUrl: p.epgUrl };
      out[out.indexOf(first)] = merged;
      kept.set(key!, merged);
    }
    replaced.set(p.id, first.id);
  }
  return { lists: replaced.size ? out : lists, replaced };
}
