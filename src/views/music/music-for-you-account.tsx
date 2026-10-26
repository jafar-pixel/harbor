import { useCallback, useEffect, useState } from "react";
import {
  MusicAccountShelf,
  type ShelfPlaylist,
  type ShelfTrack,
} from "@/components/music/music-account-shelf";
import { loadSpotifyLibraryPage } from "@/lib/music/spotify-library";
import type { MusicTrack } from "@/lib/music/types";

/**
 * For you on the desktop and TV apps: the listener's own Spotify (the native connection) at the
 * top. Playlists and liked songs play through the app's source picker, like any other song.
 */
export function MusicForYouAccount({
  active,
  spotifyConnected,
  onConnect,
  onYouTube,
  onPlay,
  onSeeAll,
}: {
  active: boolean;
  spotifyConnected: boolean;
  onConnect: () => void;
  onYouTube: () => void;
  onPlay: (track: MusicTrack, queue: MusicTrack[]) => void;
  onSeeAll: () => void;
}) {
  const [playlists, setPlaylists] = useState<ShelfPlaylist[]>([]);
  const [liked, setLiked] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!active || !spotifyConnected || loaded) return;
    let live = true;
    setLoading(true);
    void Promise.allSettled([loadSpotifyLibraryPage("playlists"), loadSpotifyLibraryPage("liked")])
      .then(([lists, songs]) => {
        if (!live) return;
        if (lists.status === "fulfilled")
          setPlaylists(
            lists.value.playlists
              .filter((p) => p.canRead)
              .map((p) => ({
                id: p.id,
                name: p.name,
                image: p.artwork[0] ?? null,
                count: p.trackCount,
              })),
          );
        if (songs.status === "fulfilled") setLiked(songs.value.tracks.slice(0, 50));
        const failed = [lists, songs].find((r) => r.status === "rejected");
        setError(
          failed && failed.status === "rejected"
            ? failed.reason instanceof Error
              ? failed.reason.message
              : String(failed.reason)
            : null,
        );
        setLoaded(true);
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [active, spotifyConnected, loaded]);

  const playPlaylist = useCallback(
    async (playlist: ShelfPlaylist) => {
      try {
        const page = await loadSpotifyLibraryPage("playlist", 0, playlist.id);
        if (page.tracks[0]) onPlay(page.tracks[0], page.tracks);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [onPlay],
  );

  const shelfLiked: ShelfTrack[] = liked.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    image: s.artwork || null,
  }));

  return (
    <MusicAccountShelf
      connected={spotifyConnected}
      provider="Spotify"
      loading={loading}
      error={error}
      playlists={playlists}
      liked={shelfLiked}
      onConnect={onConnect}
      onConnectYouTube={onYouTube}
      onPlaylist={(p) => void playPlaylist(p)}
      onLiked={() => liked[0] && onPlay(liked[0], liked)}
      onTrack={(i) => liked[i] && onPlay(liked[i], liked.slice(i))}
      onSeeAll={onSeeAll}
    />
  );
}
