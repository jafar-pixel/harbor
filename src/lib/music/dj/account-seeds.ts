import { readMusicPreference, writeMusicPreference } from "../preferences";

/**
 * Artists from the listener's connected music accounts (Spotify top artists, YouTube likes), so
 * the AI DJ builds sets around what they actually play. Kept per source on this device.
 */

const KEY = "harbor.music.dj.account-seeds.v1";
type Seeds = Record<string, string[]>;

function read(): Seeds {
  try {
    const v = JSON.parse(readMusicPreference(KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Seeds) : {};
  } catch {
    return {};
  }
}

export function setAccountSeeds(source: string, artists: string[]): void {
  const all = read();
  const clean = [...new Set(artists.map((a) => a.trim()).filter(Boolean))].slice(0, 30);
  if (clean.length) all[source] = clean;
  else delete all[source];
  writeMusicPreference(KEY, JSON.stringify(all));
}

/** Every connected source's artists, interleaved so no one source crowds out the others. */
export function accountSeeds(limit = 15): string[] {
  const lists = Object.values(read());
  const out: string[] = [];
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++)
    for (const list of lists) if (list[i] && !out.includes(list[i])) out.push(list[i]);
  return out.slice(0, limit);
}
