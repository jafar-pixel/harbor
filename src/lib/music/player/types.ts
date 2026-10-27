/** Where a song in the shared web player comes from. */
export type PlayerSource = "youtube" | "spotify" | "file" | "jellyfin" | "song";

/**
 * One entry in the shared player's queue. YouTube songs carry their video; files and Jellyfin
 * carry a stream URL; Spotify and plain songs are matched to their YouTube video when they play.
 */
export type PlayerTrack = {
  /** Unique per queue entry (the same song can be queued twice). */
  key: string;
  source: PlayerSource;
  title: string;
  artist: string;
  album?: string;
  art: string | null;
  videoId?: string | null;
  url?: string | null;
  durationSec?: number;
  bpm?: number;
  /** Camelot key (1A-12B). */
  camelot?: string;
};

/** What a deck can load. */
export type Playable = { kind: "youtube"; videoId: string } | { kind: "media"; url: string };

export type RepeatMode = "off" | "all" | "one";

let counter = 0;
export function trackKey(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

/** A queue entry from song fields, with a fresh key. */
export function makeTrack(fields: Omit<PlayerTrack, "key">): PlayerTrack {
  return { ...fields, key: trackKey() };
}
