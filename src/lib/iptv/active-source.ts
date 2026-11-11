import type { IptvPlaylistSource } from "./types";

const ACTIVE_KEY = "harbor.iptv.active";

export function readActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/** Sent when the provider Live TV shows changes (Settings › Live TV picks it). */
export const ACTIVE_SOURCE_EVENT = "harbor:iptv-active";
/** Sent when Settings asks for a provider's channels to be fetched again (detail: its id). */
export const REFRESH_SOURCE_EVENT = "harbor:iptv-refresh";

export function writeActiveId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACTIVE_SOURCE_EVENT));
}

export function requestSourceRefresh(id: string): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(REFRESH_SOURCE_EVENT, { detail: id }));
}

export function toPlaylistSource(p: IptvPlaylistSource): IptvPlaylistSource {
  return { id: p.id, name: p.name, url: p.url, epgUrl: p.epgUrl, kind: p.kind, xtream: p.xtream };
}

/** The saved active source, or the first channel source when nothing valid is saved. */
export function resolveActiveSource(
  sources: IptvPlaylistSource[],
  activeId: string | null,
): IptvPlaylistSource | null {
  const channelSources = sources.filter((s) => (s.kind ?? "m3u") !== "epg");
  const found = channelSources.find((s) => s.id === activeId) ?? channelSources[0];
  return found ? toPlaylistSource(found) : null;
}
