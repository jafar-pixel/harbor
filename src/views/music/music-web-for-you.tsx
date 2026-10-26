import { useEffect, useState } from "react";
import {
  MusicAccountShelf,
  type ShelfArtist,
  type ShelfPlaylist,
} from "@/components/music/music-account-shelf";
import { setAccountSeeds } from "@/lib/music/dj/account-seeds";
import { startDj, startFromSong } from "@/lib/music/dj/session";
import { requestMusicTab } from "@/lib/music/social/inbox";
import {
  spotifyLikedTracks,
  spotifyPlaylists,
  spotifyPlaylistTracks,
  spotifyTopArtists,
  type SpotifyWebTrack,
} from "@/lib/music/spotify-web/api";
import { connectSpotifyWeb, useSpotifyWeb } from "@/lib/music/spotify-web/auth";
import { useSettings } from "@/lib/settings";

/**
 * For you on the web app: the listener's own Spotify first. Songs and playlists play through
 * the AI DJ (YouTube), which carries on in the same feel.
 */
export function MusicWebForYou({ active }: { active: boolean }) {
  const spotify = useSpotifyWeb();
  const { settings } = useSettings();
  const styles = settings.musicStyles ?? [];
  const [playlists, setPlaylists] = useState<ShelfPlaylist[]>([]);
  const [liked, setLiked] = useState<SpotifyWebTrack[]>([]);
  const [artists, setArtists] = useState<ShelfArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!active || !spotify.connected || loaded) return;
    let live = true;
    setLoading(true);
    void Promise.allSettled([spotifyPlaylists(30), spotifyLikedTracks(50), spotifyTopArtists(16)])
      .then(([lists, songs, top]) => {
        if (!live) return;
        if (lists.status === "fulfilled")
          setPlaylists(
            lists.value.map((p) => ({ id: p.id, name: p.name, image: p.image, count: p.count })),
          );
        if (songs.status === "fulfilled") setLiked(songs.value);
        if (top.status === "fulfilled") {
          setArtists(top.value.map((a) => ({ id: a.id, name: a.name, image: a.image })));
          setAccountSeeds(
            "spotify",
            top.value.map((a) => a.name),
          );
        }
        const failed = [lists, songs, top].find((r) => r.status === "rejected");
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
  }, [active, spotify.connected, loaded]);

  const play = (track: SpotifyWebTrack | undefined) => {
    if (!track) return;
    void startFromSong({ artist: track.artist, title: track.title, why: "" }, styles, "Spotify");
    requestMusicTab("dj");
  };

  return (
    <MusicAccountShelf
      connected={spotify.connected}
      provider="Spotify"
      loading={loading || spotify.finishing}
      error={error ?? spotify.error}
      playlists={playlists}
      liked={liked.map((s) => ({ id: s.id, title: s.title, artist: s.artist, image: s.image }))}
      artists={artists}
      onConnect={() => void connectSpotifyWeb()}
      onPlaylist={(p) =>
        void spotifyPlaylistTracks(p.id)
          .then((tracks) => play(tracks[0]))
          .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      }
      onLiked={() => play(liked[0])}
      onTrack={(i) => play(liked[i])}
      onArtist={(a) => {
        void startDj(
          {
            id: `spotify-artist-${a.id}`,
            name: a.name,
            prompt: `Songs by ${a.name} and artists who sound like them`,
            colors: ["#1db954", "#0b3d1f"],
          },
          styles,
        );
        requestMusicTab("dj");
      }}
      onSeeAll={() => requestMusicTab("spotify")}
    />
  );
}
