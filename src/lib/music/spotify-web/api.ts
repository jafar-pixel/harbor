import { spotifyWebToken } from "./auth";

/** The few Spotify Web API reads the web app needs: who you are, your top artists and songs,
 * your playlists and your liked songs. */

export type SpotifyWebTrack = {
  id: string;
  /** spotify:track:… (what playlist edits take). */
  uri: string;
  title: string;
  artist: string;
  album: string;
  image: string | null;
  url: string | null;
  durationSec?: number;
};
export type SpotifyWebArtist = {
  id: string;
  name: string;
  genres: string[];
  image: string | null;
  url: string | null;
};
export type SpotifyWebPlaylist = {
  id: string;
  /** The owner's Spotify user id: only your own playlists can be changed. */
  ownerId: string;
  name: string;
  owner: string;
  count: number;
  image: string | null;
  url: string | null;
};
export type SpotifyWebProfile = {
  id: string;
  name: string;
  product: string;
  image: string | null;
  country: string | null;
};

type Json = Record<string, unknown>;

export async function get(path: string): Promise<Json> {
  const token = await spotifyWebToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 403)
    throw new Error(
      "Spotify hasn't let this account into JL Media Vision yet. Ask the owner to add your Spotify email under the app's User Management.",
    );
  if (!res.ok) throw new Error(`Spotify request failed (${res.status}).`);
  return (await res.json()) as Json;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown) => (Array.isArray(v) ? (v as Json[]) : []);
const firstImage = (v: unknown) => str(arr(v)[0]?.url) || null;
const external = (v: unknown) => str((v as Json | undefined)?.spotify) || null;

function track(t: Json | undefined): SpotifyWebTrack | null {
  if (!t || !t.id) return null;
  const album = (t.album ?? {}) as Json;
  return {
    id: str(t.id),
    uri: str(t.uri) || `spotify:track:${str(t.id)}`,
    title: str(t.name),
    artist: arr(t.artists)
      .map((a) => str(a.name))
      .filter(Boolean)
      .join(", "),
    album: str(album.name),
    image: firstImage(album.images),
    url: external(t.external_urls),
    durationSec: typeof t.duration_ms === "number" ? Math.round(t.duration_ms / 1000) : undefined,
  };
}

/** Songs matching a search, from Spotify's catalog. */
export async function spotifySearchTracks(q: string, limit = 20): Promise<SpotifyWebTrack[]> {
  const page = await get(`/search?type=track&limit=${limit}&q=${encodeURIComponent(q)}`);
  return arr((page.tracks as Json | undefined)?.items)
    .map(track)
    .filter((t): t is SpotifyWebTrack => !!t);
}

export async function spotifyProfile(): Promise<SpotifyWebProfile> {
  const me = await get("/me");
  return {
    id: str(me.id),
    name: str(me.display_name) || str(me.id),
    product: str(me.product),
    image: firstImage(me.images),
    country: str(me.country) || null,
  };
}

export async function spotifyTopArtists(limit = 20): Promise<SpotifyWebArtist[]> {
  const page = await get(`/me/top/artists?limit=${limit}&time_range=medium_term`);
  return arr(page.items).map((a) => ({
    id: str(a.id),
    name: str(a.name),
    genres: arr(a.genres as unknown).map(String),
    image: firstImage(a.images),
    url: external(a.external_urls),
  }));
}

export async function spotifyTopTracks(limit = 20): Promise<SpotifyWebTrack[]> {
  const page = await get(`/me/top/tracks?limit=${limit}&time_range=short_term`);
  return arr(page.items)
    .map(track)
    .filter((t): t is SpotifyWebTrack => !!t);
}

export async function spotifyLikedTracks(limit = 50): Promise<SpotifyWebTrack[]> {
  const page = await get(`/me/tracks?limit=${limit}`);
  return arr(page.items)
    .map((item) => track(item.track as Json))
    .filter((t): t is SpotifyWebTrack => !!t);
}

export async function spotifyPlaylists(limit = 50): Promise<SpotifyWebPlaylist[]> {
  const page = await get(`/me/playlists?limit=${limit}`);
  return arr(page.items)
    .filter((p) => p && p.id)
    .map((p) => {
      const items = (p.items ?? p.tracks ?? {}) as Json;
      return {
        id: str(p.id),
        name: str(p.name),
        owner: str((p.owner as Json | undefined)?.display_name),
        ownerId: str((p.owner as Json | undefined)?.id),
        count: typeof items.total === "number" ? items.total : 0,
        image: firstImage(p.images),
        url: external(p.external_urls),
      };
    });
}

export async function spotifyPlaylistTracks(id: string, limit = 100): Promise<SpotifyWebTrack[]> {
  const page = await get(`/playlists/${encodeURIComponent(id)}/items?limit=${limit}`).catch(() =>
    get(`/playlists/${encodeURIComponent(id)}/tracks?limit=${limit}`),
  );
  return arr(page.items)
    .map((item) => track((item.item ?? item.track) as Json))
    .filter((t): t is SpotifyWebTrack => !!t);
}

/** Every row of a playlist in order, up to 1000; edits address rows by position. */
export async function spotifyPlaylistRows(id: string): Promise<(SpotifyWebTrack | null)[]> {
  const rows: (SpotifyWebTrack | null)[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await get(
      `/playlists/${encodeURIComponent(id)}/items?limit=100&offset=${offset}`,
    ).catch(() => get(`/playlists/${encodeURIComponent(id)}/tracks?limit=100&offset=${offset}`));
    const items = arr(page.items);
    // Local files and podcast episodes keep their place as empty rows, so positions stay true.
    for (const item of items) rows.push(track((item.item ?? item.track) as Json));
    if (items.length < 100) break;
  }
  return rows;
}

/** The album cover for a song, from the listener's own Spotify (no extra quota). */
export async function spotifyCover(artist: string, title: string): Promise<string | null> {
  const q = `track:${title.replace(/"/g, "")} artist:${artist.replace(/"/g, "")}`;
  const page = await get(`/search?type=track&limit=1&q=${encodeURIComponent(q)}`);
  const first = arr((page.tracks as Json | undefined)?.items)[0];
  return first ? firstImage((first.album as Json | undefined)?.images) : null;
}
