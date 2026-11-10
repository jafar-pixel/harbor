import { resolveFor, type AutoSong } from "../automix/playlists";
import type { VideoSong } from "./video-decks";
import { crateItem } from "./library";
import type { MixSong } from "./youtube-audio";

/**
 * A turntable's song for a video deck: a YouTube Music song keeps its video (its crate id is
 * yt:<video>); a music file of your own has no video, so it returns null.
 */
export function videoSongFromCrate(id: string): VideoSong | null {
  if (!id.startsWith("yt:")) return null;
  const item = crateItem(id);
  return {
    videoId: id.slice(3),
    title: item?.title ?? "",
    artist: item?.artist ?? "",
    art: item?.art ?? null,
    bpm: item?.bpm,
    key: item?.key?.camelot,
  };
}

/**
 * A playlist song's YouTube Music video: its own, or (for a Spotify song) its match there.
 * Spotify's audio can't be mixed, so a Spotify song plays from YouTube Music on the decks.
 */
export async function youtubeSongFor(song: AutoSong): Promise<MixSong & VideoSong> {
  const match = song.videoId ? song : await resolveFor("youtube", song);
  if (!match?.videoId)
    throw new Error(`Couldn't find “${song.title}” on YouTube Music. Try another song.`);
  return {
    videoId: match.videoId,
    title: song.title,
    artist: song.artist,
    art: song.image ?? match.image ?? null,
    bpm: song.bpm,
    key: song.key,
  };
}
