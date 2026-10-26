import { youtubeWebToken } from "./auth";
import { channelArtist, songFromVideo } from "./songs";

/**
 * The listener's own YouTube (and YouTube Music, whose playlists and likes live on the same
 * account) through the YouTube Data API: their playlists, the songs they liked and the artist
 * channels they follow. Saved albums, uploads and YouTube Music's own mixes aren't in the API.
 */

export type YouTubeSong = {
  videoId: string;
  title: string;
  artist: string;
  image: string | null;
};
export type YouTubePlaylist = { id: string; name: string; count: number; image: string | null };

type Json = Record<string, unknown>;
const API = "https://www.googleapis.com/youtube/v3";

async function get(path: string): Promise<Json> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${youtubeWebToken()}` },
  });
  if (res.status === 401)
    throw new Error("Your YouTube sign in ran out. Reconnect to keep your music here.");
  if (res.status === 403)
    throw new Error(
      "Google hasn't let this account into JL Media Vision yet. Ask the owner to add your Gmail as a test user.",
    );
  if (!res.ok) throw new Error(`YouTube request failed (${res.status}).`);
  return (await res.json()) as Json;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown) => (Array.isArray(v) ? (v as Json[]) : []);

function thumb(snippet: Json): string | null {
  const t = (snippet.thumbnails ?? {}) as Record<string, Json>;
  return str((t.maxres ?? t.high ?? t.medium ?? t.default)?.url) || null;
}

function song(videoId: string, snippet: Json): YouTubeSong | null {
  if (!videoId) return null;
  const channel = str(snippet.videoOwnerChannelTitle) || str(snippet.channelTitle);
  const { artist, title } = songFromVideo(str(snippet.title), channel);
  if (!title || title === "Deleted video" || title === "Private video") return null;
  return { videoId, title, artist, image: thumb(snippet) };
}

export async function youtubePlaylists(): Promise<YouTubePlaylist[]> {
  const page = await get("/playlists?part=snippet,contentDetails&mine=true&maxResults=50");
  return arr(page.items).map((p) => {
    const snippet = (p.snippet ?? {}) as Json;
    return {
      id: str(p.id),
      name: str(snippet.title),
      count: Number((p.contentDetails as Json | undefined)?.itemCount ?? 0),
      image: thumb(snippet),
    };
  });
}

/** Songs the listener liked, music first (YouTube Music likes count as YouTube likes). */
export async function youtubeLikedSongs(): Promise<YouTubeSong[]> {
  const page = await get("/videos?part=snippet&myRating=like&maxResults=50");
  const items = arr(page.items);
  const music = items.filter((v) => str((v.snippet as Json | undefined)?.categoryId) === "10");
  return (music.length >= 6 ? music : items)
    .map((v) => song(str(v.id), (v.snippet ?? {}) as Json))
    .filter((s): s is YouTubeSong => !!s);
}

export async function youtubePlaylistSongs(id: string): Promise<YouTubeSong[]> {
  const page = await get(
    `/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(id)}`,
  );
  return arr(page.items)
    .map((i) => {
      const snippet = (i.snippet ?? {}) as Json;
      return song(str((snippet.resourceId as Json | undefined)?.videoId), snippet);
    })
    .filter((s): s is YouTubeSong => !!s);
}

/** Artist channels the listener follows (for the AI DJ's seeds). */
export async function youtubeFollowedArtists(): Promise<string[]> {
  const page = await get("/subscriptions?part=snippet&mine=true&maxResults=50&order=relevance");
  return (
    arr(page.items)
      .map((s) => str((s.snippet as Json | undefined)?.title))
      // Only artist channels ("- Topic", VEVO): vloggers and podcasts would steer the DJ wrong.
      .filter((name) => /-\s*Topic$|VEVO$/i.test(name))
      .map(channelArtist)
      .filter(Boolean)
  );
}
