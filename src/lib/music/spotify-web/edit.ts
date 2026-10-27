import { spotifyWebToken } from "./auth";
import { get, type SpotifyWebPlaylist, type SpotifyWebTrack } from "./api";

/**
 * Changes to the listener's own Spotify playlists: create, rename, delete (unfollow), add,
 * remove and reorder songs, and song search to add from. Each call goes straight to Spotify.
 */

type Json = Record<string, unknown>;

async function send(method: string, path: string, body?: unknown): Promise<Json> {
  const token = await spotifyWebToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403)
    throw new Error("Spotify didn't allow that change. Reconnect Spotify with editing turned on.");
  if (!res.ok) throw new Error(`Spotify couldn't save that change (${res.status}).`);
  const text = await res.text();
  return text ? (JSON.parse(text) as Json) : {};
}

/** Spotify renamed playlist "tracks" to "items"; try the new path, then the old one. */
async function items(method: string, id: string, body: unknown, oldBody = body): Promise<Json> {
  const base = `/playlists/${encodeURIComponent(id)}`;
  return send(method, `${base}/items`, body).catch(() => send(method, `${base}/tracks`, oldBody));
}

export async function createSpotifyPlaylist(
  userId: string,
  name: string,
): Promise<SpotifyWebPlaylist> {
  const p = await send("POST", `/users/${encodeURIComponent(userId)}/playlists`, {
    name,
    public: false,
    description: "Made in JL Media Vision",
  });
  return {
    id: String(p.id ?? ""),
    ownerId: userId,
    name,
    owner: "",
    count: 0,
    image: null,
    url: null,
  };
}

export const renameSpotifyPlaylist = (id: string, name: string) =>
  send("PUT", `/playlists/${encodeURIComponent(id)}`, { name });

/** Spotify has no delete: removing a playlist from your library unfollows it. */
export const deleteSpotifyPlaylist = (id: string) =>
  send("DELETE", `/playlists/${encodeURIComponent(id)}/followers`);

export const addSpotifyTracks = (id: string, uris: string[]) =>
  items("POST", id, { uris: uris.slice(0, 100) });

export const removeSpotifyTrack = (id: string, uri: string) =>
  items("DELETE", id, { items: [{ uri }] }, { tracks: [{ uri }] });

/** Move the song at `from` so it ends up at `to`. */
export function moveSpotifyTrack(id: string, from: number, to: number) {
  if (from === to) return Promise.resolve({});
  return items("PUT", id, { range_start: from, insert_before: to > from ? to + 1 : to });
}

export async function searchSpotifyTracks(query: string): Promise<SpotifyWebTrack[]> {
  const page = await get(`/search?type=track&limit=12&q=${encodeURIComponent(query)}`);
  const list = ((page.tracks as Json | undefined)?.items ?? []) as Json[];
  return list
    .filter((t) => t && t.id)
    .map((t) => {
      const album = (t.album ?? {}) as Json;
      const images = (album.images ?? []) as Json[];
      return {
        id: String(t.id),
        uri: String(t.uri ?? `spotify:track:${String(t.id)}`),
        title: String(t.name ?? ""),
        artist: ((t.artists ?? []) as Json[]).map((a) => String(a.name ?? "")).join(", "),
        album: String(album.name ?? ""),
        image: (images[0]?.url as string | undefined) ?? null,
        url: null,
      };
    });
}
