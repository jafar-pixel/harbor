import { askDj, searchVideos } from "../dj/api";
import { pickVideo, songQuery, type DjSong } from "../dj/vibes";
import type { HubService } from "../hub/library";
import type { PlayerTrack } from "../player/types";
import { spotifyPlaylistRows, spotifyPlaylists, spotifyProfile } from "../spotify-web/api";
import {
  addSpotifyTracks,
  createSpotifyPlaylist,
  deleteSpotifyPlaylist,
  moveSpotifyTrack,
  removeSpotifyTrack,
  renameSpotifyPlaylist,
  searchSpotifyTracks,
} from "../spotify-web/edit";
import { youtubePlaylistRows, youtubePlaylists } from "../youtube-web/api";
import { songFromVideo } from "../youtube-web/songs";
import {
  addYouTubeVideo,
  createYouTubePlaylist,
  deleteYouTubePlaylist,
  moveYouTubeItem,
  removeYouTubeItem,
  renameYouTubePlaylist,
} from "../youtube-web/edit";

/**
 * Integrated Automix's playlists: the listener's YouTube and Spotify playlists behind one
 * shape, so the same screen lists, edits (add, remove, reorder, create, rename, delete) and
 * mixes either. Every change goes straight to the service. The AI suggests songs that fit a
 * playlist and can build a new one from a prompt.
 */

export type AutoList = {
  service: HubService;
  id: string;
  name: string;
  image: string | null;
  count: number;
  /** The listener's own playlist (only those can be changed). */
  mine: boolean;
};

export type AutoRow = {
  key: string;
  title: string;
  artist: string;
  image: string | null;
  durationSec?: number;
  uri?: string;
  videoId?: string;
  itemId?: string;
};

/** A song to add: from search or the AI (needs a Spotify uri or a YouTube video when known). */
export type AutoSong = {
  title: string;
  artist: string;
  image: string | null;
  uri?: string;
  videoId?: string;
  bpm?: number;
  key?: string;
};

let spotifyMe: Promise<string> | null = null;
const myId = () => (spotifyMe ??= spotifyProfile().then((p) => p.id));

export async function listPlaylists(service: HubService): Promise<AutoList[]> {
  if (service === "spotify") {
    const [me, all] = await Promise.all([myId(), spotifyPlaylists(50)]);
    return all.map((p) => ({
      service,
      id: p.id,
      name: p.name,
      image: p.image,
      count: p.count,
      mine: !p.ownerId || p.ownerId === me,
    }));
  }
  return (await youtubePlaylists()).map((p) => ({ service, ...p, mine: true }));
}

export async function playlistRows(list: AutoList): Promise<AutoRow[]> {
  if (list.service === "spotify") {
    const rows = await spotifyPlaylistRows(list.id);
    return rows.map((r, i) =>
      r
        ? {
            key: `${i}:${r.id}`,
            title: r.title,
            artist: r.artist,
            image: r.image,
            uri: r.uri,
            durationSec: r.durationSec,
          }
        : { key: `${i}:x`, title: "Unavailable song", artist: "", image: null },
    );
  }
  return (await youtubePlaylistRows(list.id)).map((r) => ({ key: r.itemId, ...r }));
}

export async function createPlaylist(service: HubService, name: string): Promise<AutoList> {
  const made =
    service === "spotify"
      ? await createSpotifyPlaylist(await myId(), name)
      : await createYouTubePlaylist(name);
  return { service, id: made.id, name: made.name, image: made.image, count: 0, mine: true };
}

export const renamePlaylist = (list: AutoList, name: string) =>
  list.service === "spotify"
    ? renameSpotifyPlaylist(list.id, name)
    : renameYouTubePlaylist(list.id, name);

export const deletePlaylist = (list: AutoList) =>
  list.service === "spotify" ? deleteSpotifyPlaylist(list.id) : deleteYouTubePlaylist(list.id);

/** Move the row at `from` to `to` (rows is the order before the move). */
export function moveRow(list: AutoList, rows: AutoRow[], from: number, to: number) {
  const row = rows[from];
  return list.service === "spotify"
    ? moveSpotifyTrack(list.id, from, to)
    : moveYouTubeItem(list.id, row.itemId!, row.videoId!, to);
}

export function removeRow(list: AutoList, row: AutoRow) {
  return list.service === "spotify"
    ? removeSpotifyTrack(list.id, row.uri!)
    : removeYouTubeItem(row.itemId!);
}

/** Find the service's own copy of a song (a Spotify uri or a YouTube video). */
async function resolveFor(service: HubService, song: AutoSong): Promise<AutoSong | null> {
  if (service === "spotify") {
    if (song.uri) return song;
    const hit = (await searchSpotifyTracks(`${song.artist} ${song.title}`))[0];
    return hit ? { ...song, uri: hit.uri, image: song.image ?? hit.image } : null;
  }
  if (song.videoId) return song;
  const dj: DjSong = { artist: song.artist, title: song.title, why: "" };
  const best = pickVideo(dj, await searchVideos(songQuery(dj)));
  return best ? { ...song, videoId: best.id, image: song.image ?? best.thumb } : null;
}

/** Add songs to a playlist, finding each on the service; returns how many were added. */
export async function addSongs(list: AutoList, songs: AutoSong[]): Promise<number> {
  const found = (
    await Promise.all(songs.map((s) => resolveFor(list.service, s).catch(() => null)))
  ).filter((s): s is AutoSong => !!s);
  if (list.service === "spotify") {
    const uris = found.map((s) => s.uri!).filter(Boolean);
    for (let i = 0; i < uris.length; i += 100)
      await addSpotifyTracks(list.id, uris.slice(i, i + 100));
    return uris.length;
  }
  // YouTube takes one video per request, in order.
  for (const s of found) await addYouTubeVideo(list.id, s.videoId!);
  return found.length;
}

export async function searchSongs(service: HubService, q: string): Promise<AutoSong[]> {
  if (service === "spotify")
    return (await searchSpotifyTracks(q)).map((s) => ({
      title: s.title,
      artist: s.artist,
      image: s.image,
      uri: s.uri,
    }));
  return (await searchVideos(q)).map((v) => {
    const { artist, title } = songFromVideo(v.title, v.channel);
    return { title, artist, image: v.thumb || null, videoId: v.id };
  });
}

const fromDj = (s: DjSong): AutoSong => ({
  title: s.title,
  artist: s.artist,
  image: null,
  bpm: s.bpm,
  key: s.key,
});

/** Songs the AI thinks fit this playlist (none already in it). */
export async function suggestFor(list: AutoList, rows: AutoRow[]): Promise<AutoSong[]> {
  const artists = [...new Set(rows.map((r) => r.artist).filter(Boolean))].slice(0, 30);
  const set = await askDj({
    request: `More songs that fit the playlist "${list.name}" and flow with it`,
    seeds: artists,
    avoid: rows.map((r) => `${r.artist} - ${r.title}`).slice(0, 60),
    count: 10,
  });
  return set.tracks.map(fromDj);
}

/** A new playlist from a prompt: the AI picks the songs, then they're added in mix order. */
export async function createFromPrompt(
  service: HubService,
  prompt: string,
): Promise<{ list: AutoList; added: number }> {
  const set = await askDj({ vibe: prompt, count: 20 });
  if (!set.tracks.length) throw new Error("The AI came back empty. Try other words.");
  const list = await createPlaylist(service, prompt.slice(0, 80));
  const added = await addSongs(list, set.tracks.map(fromDj));
  return { list: { ...list, count: added }, added };
}

/** A song or row as a player track (Automix carries tempo and key). */
export function rowTrack(
  service: HubService,
  r: {
    title: string;
    artist: string;
    image: string | null;
    videoId?: string;
    durationSec?: number;
  },
  facts?: { bpm?: number; key?: string },
): Omit<PlayerTrack, "key"> {
  return {
    source: service,
    title: r.title,
    artist: r.artist,
    art: r.image,
    videoId: r.videoId ?? null,
    durationSec: r.durationSec,
    bpm: facts?.bpm,
    camelot: facts?.key,
  };
}
