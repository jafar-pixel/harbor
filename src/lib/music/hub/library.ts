import { searchVideos } from "../dj/api";
import type { PlayerTrack } from "../player/types";
import {
  spotifyLikedTracks,
  spotifyPlaylists,
  spotifyPlaylistTracks,
  spotifySearchTracks,
  type SpotifyWebTrack,
} from "../spotify-web/api";
import { songFromVideo } from "../youtube-web/songs";
import {
  youtubeLikedSongs,
  youtubePlaylists,
  youtubePlaylistSongs,
  type YouTubeSong,
} from "../youtube-web/api";

/**
 * The Music Hub's library: the listener's YouTube and Spotify side by side (playlists, recently
 * liked songs), search across both, and browse categories. Everything converts to the shared
 * player's tracks so any of it plays, queues or mixes the same way.
 */

export type HubService = "youtube" | "spotify";

export type HubPlaylist = {
  id: string;
  service: HubService;
  name: string;
  image: string | null;
  count: number;
};

export type HubSong = {
  id: string;
  service: HubService;
  title: string;
  artist: string;
  album?: string;
  image: string | null;
  videoId?: string;
  durationSec?: number;
};

export const SERVICE_LABEL: Record<HubService, string> = {
  youtube: "YouTube Music",
  spotify: "Spotify",
};

const fromSpotify = (t: SpotifyWebTrack): HubSong => ({
  id: `spotify:${t.id}`,
  service: "spotify",
  title: t.title,
  artist: t.artist,
  album: t.album,
  image: t.image,
  durationSec: t.durationSec,
});

const fromYouTube = (s: YouTubeSong): HubSong => ({
  id: `youtube:${s.videoId}`,
  service: "youtube",
  title: s.title,
  artist: s.artist,
  image: s.image,
  videoId: s.videoId,
});

/** A Hub song as a player track. */
export function playerTrack(song: HubSong): Omit<PlayerTrack, "key"> {
  return {
    source: song.service,
    title: song.title,
    artist: song.artist,
    album: song.album,
    art: song.image,
    videoId: song.videoId ?? null,
    durationSec: song.durationSec,
  };
}

/** Two lists merged one from each in turn, the main service first. */
function interleave<T>(first: T[], second: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(first.length, second.length); i++) {
    if (i < first.length) out.push(first[i]);
    if (i < second.length) out.push(second[i]);
  }
  return out;
}

export type HubLibrary = {
  playlists: HubPlaylist[];
  recent: HubSong[];
  errors: Partial<Record<HubService, string>>;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Playlists and recently liked songs from each connected service. */
export async function loadHubLibrary(
  connected: Record<HubService, boolean>,
  main: HubService,
): Promise<HubLibrary> {
  const errors: HubLibrary["errors"] = {};
  const take = async <T>(service: HubService, run: () => Promise<T[]>): Promise<T[]> => {
    if (!connected[service]) return [];
    try {
      return await run();
    } catch (e) {
      errors[service] = message(e);
      return [];
    }
  };
  const [ytLists, ytLiked, spLists, spLiked] = await Promise.all([
    take("youtube", async () =>
      (await youtubePlaylists()).map((p): HubPlaylist => ({
        ...p,
        service: "youtube",
        count: p.count,
      })),
    ),
    take("youtube", async () => (await youtubeLikedSongs()).map(fromYouTube)),
    take("spotify", async () =>
      (await spotifyPlaylists(50)).map((p): HubPlaylist => ({
        id: p.id,
        service: "spotify",
        name: p.name,
        image: p.image,
        count: p.count,
      })),
    ),
    take("spotify", async () => (await spotifyLikedTracks(50)).map(fromSpotify)),
  ]);
  const [lists1, lists2] = main === "spotify" ? [spLists, ytLists] : [ytLists, spLists];
  const [liked1, liked2] = main === "spotify" ? [spLiked, ytLiked] : [ytLiked, spLiked];
  return {
    playlists: interleave(lists1, lists2),
    recent: interleave(liked1, liked2),
    errors,
  };
}

/** Every song in a playlist. */
export async function hubPlaylistSongs(p: HubPlaylist): Promise<HubSong[]> {
  return p.service === "spotify"
    ? (await spotifyPlaylistTracks(p.id, 100)).map(fromSpotify)
    : (await youtubePlaylistSongs(p.id)).map(fromYouTube);
}

/** YouTube videos (cached for every listener on the JL server) as Hub songs. */
async function youtubeSearch(q: string): Promise<HubSong[]> {
  const results = await searchVideos(q, "music");
  return results.map((v) => {
    const { artist, title } = songFromVideo(v.title, v.channel);
    return {
      id: `youtube:${v.id}`,
      service: "youtube" as const,
      title,
      artist,
      image: v.thumb || null,
      videoId: v.id,
    };
  });
}

/** Search both services; whichever answers shows. */
export async function searchHub(
  q: string,
  spotifyConnected: boolean,
): Promise<{ songs: HubSong[]; error: string | null }> {
  const [yt, sp] = await Promise.allSettled([
    youtubeSearch(q),
    spotifyConnected ? spotifySearchTracks(q, 20).then((r) => r.map(fromSpotify)) : [],
  ]);
  const songs = interleave(
    yt.status === "fulfilled" ? yt.value : [],
    sp.status === "fulfilled" ? sp.value : [],
  );
  const failed = [yt, sp].find((r) => r.status === "rejected");
  return {
    songs,
    error: !songs.length && failed && failed.status === "rejected" ? message(failed.reason) : null,
  };
}

export type HubCategory = { id: string; label: string; query: string };
export type HubCategoryGroup = { id: string; label: string; items: HubCategory[] };

const year = new Date().getFullYear();

/** Browse: each category is a search the shared player can play straight away. */
export const HUB_CATEGORIES: HubCategoryGroup[] = [
  {
    id: "new",
    label: "New",
    items: [
      {
        id: "new-week",
        label: "New this week",
        query: `new music this week ${year} official video`,
      },
      { id: "new-hiphop", label: "New Hip-Hop", query: `new hip hop songs ${year} official video` },
      { id: "new-rnb", label: "New R&B", query: `new r&b songs ${year} official video` },
      { id: "new-gospel", label: "New Gospel", query: `new gospel songs ${year}` },
    ],
  },
  {
    id: "charts",
    label: "Charts",
    items: [
      { id: "top-hits", label: "Top hits", query: `top hits ${year} official music video` },
      { id: "billboard", label: "Hot 100", query: `billboard hot 100 this week ${year}` },
      { id: "afro-charts", label: "Afrobeats chart", query: `top afrobeats songs ${year}` },
      { id: "latin-charts", label: "Latin chart", query: `top latin songs ${year}` },
    ],
  },
  {
    id: "genres",
    label: "Genres",
    items: [
      "Hip-Hop",
      "R&B",
      "Soul",
      "Gospel",
      "Jazz",
      "Reggae",
      "Afrobeats",
      "Rock",
      "Pop",
      "Latin",
      "Country",
      "House",
      "Classical",
    ].map((g) => ({ id: `genre-${g}`, label: g, query: `best ${g} songs official video` })),
  },
  {
    id: "moods",
    label: "Moods",
    items: [
      ["Chill", "chill vibes songs"],
      ["Workout", "workout motivation songs"],
      ["Party", "party anthems official video"],
      ["Focus", "focus instrumental music"],
      ["Romance", "romantic love songs"],
      ["Late night", "late night smooth r&b"],
      ["Sunday", "sunday morning soul and gospel"],
    ].map(([label, query]) => ({ id: `mood-${label}`, label, query })),
  },
];

export function categorySongs(c: HubCategory): Promise<HubSong[]> {
  return youtubeSearch(c.query);
}

export const formatDuration = (s?: number) =>
  s && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "";
