import type { AutoSong } from "./automix/playlists";
import type { HubSong } from "./hub/library";
import type { PlayerTrack } from "./player/types";
import { crateItem } from "./studio/library";
import type { StudioDrag } from "./studio/drag";

/**
 * Songs dragged anywhere in Music (the Hub's lists, DJ Studio's playlists, crate and video
 * songs) dropped on the player: "Play now" or "Add to queue". One drag format serves the decks,
 * the queues and the new-playlist builder alike (STUDIO_DRAG_TYPE, see studio/drag.ts).
 */

/** A Hub song as a draggable playlist song. */
export function hubDragSong(s: HubSong): AutoSong {
  return {
    title: s.title,
    artist: s.artist,
    image: s.image,
    videoId: s.videoId,
    uri: s.service === "spotify" ? `spotify:track:${s.id.replace(/^spotify:/, "")}` : undefined,
  };
}

/** What the shared player plays for a dropped song; null when there's nothing it can play. */
export function trackFromDrag(drag: StudioDrag): Omit<PlayerTrack, "key"> | null {
  switch (drag.kind) {
    case "song":
      return {
        source: drag.song.videoId ? "youtube" : drag.song.uri ? "spotify" : "song",
        title: drag.song.title,
        artist: drag.song.artist,
        art: drag.song.image,
        videoId: drag.song.videoId ?? null,
      };
    case "video":
      return {
        source: "youtube",
        title: drag.song.title,
        artist: drag.song.artist,
        art: drag.song.art,
        videoId: drag.song.videoId,
      };
    case "url":
      return {
        source: "file",
        title: drag.title,
        artist: drag.artist,
        art: drag.art,
        url: drag.url,
      };
    case "crate": {
      const item = crateItem(drag.id);
      if (!item) return null;
      // A YouTube Music song fetched for the turntables plays from YouTube in the player.
      if (drag.id.startsWith("yt:"))
        return {
          source: "youtube",
          title: item.title,
          artist: item.artist,
          art: item.art ?? null,
          videoId: drag.id.slice(3),
        };
      const url = item.url ?? (item.file ? URL.createObjectURL(item.file) : null);
      if (!url) return null;
      return { source: "file", title: item.title, artist: item.artist, art: item.art ?? null, url };
    }
  }
}

/** A dropped song as a playlist song (for the new-playlist builder); null for local files. */
export function songFromDrag(drag: StudioDrag): AutoSong | null {
  if (drag.kind === "song") return drag.song;
  if (drag.kind === "crate" && drag.id.startsWith("yt:")) {
    const item = crateItem(drag.id);
    return {
      title: item?.title ?? "",
      artist: item?.artist ?? "",
      image: item?.art ?? null,
      videoId: drag.id.slice(3),
    };
  }
  if (drag.kind === "video")
    return {
      title: drag.song.title,
      artist: drag.song.artist,
      image: drag.song.art,
      videoId: drag.song.videoId,
      bpm: drag.song.bpm,
      key: drag.song.key,
    };
  return null;
}
