import { useEffect, useState } from "react";
import {
  MusicAccountShelf,
  type ShelfArtist,
  type ShelfPlaylist,
} from "@/components/music/music-account-shelf";
import { useT } from "@/lib/i18n";
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
import {
  youtubeFollowedArtists,
  youtubeLikedSongs,
  youtubePlaylistSongs,
  youtubePlaylists,
  type YouTubeSong,
} from "@/lib/music/youtube-web/api";
import {
  connectYouTubeWeb,
  disconnectYouTubeWeb,
  useYouTubeWeb,
} from "@/lib/music/youtube-web/auth";
import { useSettings } from "@/lib/settings";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * For you on the web app: the listener's own Spotify and YouTube Music first. Songs and
 * playlists play through the AI DJ (YouTube video), which carries on in the same feel.
 */
export function MusicWebForYou({ active }: { active: boolean }) {
  const t = useT();
  const spotify = useSpotifyWeb();
  const youtube = useYouTubeWeb();

  if (!spotify.connected && !youtube.connected) {
    return (
      <MusicAccountShelf
        connected={false}
        provider=""
        loading={false}
        error={spotify.error ?? youtube.error}
        playlists={[]}
        liked={[]}
        onConnect={() => void connectSpotifyWeb()}
        onConnectYouTube={() => void connectYouTubeWeb()}
        onPlaylist={() => {}}
        onLiked={() => {}}
        onTrack={() => {}}
        youtubeLabel={youtube.linked ? t("Reconnect YouTube") : undefined}
      />
    );
  }
  return (
    <div className="flex flex-col gap-10">
      {youtube.connected ? (
        <YouTubeShelf active={active} />
      ) : (
        <ConnectMore
          label={youtube.linked ? t("Reconnect YouTube Music") : t("Also connect YouTube Music")}
          error={youtube.error}
          onClick={() => void connectYouTubeWeb()}
        />
      )}
      {spotify.connected ? (
        <SpotifyShelf active={active} />
      ) : (
        <ConnectMore
          label={t("Also connect Spotify")}
          error={spotify.error}
          onClick={() => void connectSpotifyWeb()}
        />
      )}
    </div>
  );
}

function ConnectMore({
  label,
  error,
  onClick,
}: {
  label: string;
  error: string | null;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        className="min-h-10 rounded-full border border-edge-soft bg-elevated px-4 text-sm font-bold text-ink hover:bg-ink/10"
      >
        {label}
      </button>
      {error && <span className="text-[13px] text-ink-muted">{error}</span>}
    </div>
  );
}

function useStyles() {
  const { settings } = useSettings();
  return settings.musicStyles ?? [];
}

function SpotifyShelf({ active }: { active: boolean }) {
  const spotify = useSpotifyWeb();
  const styles = useStyles();
  const [playlists, setPlaylists] = useState<ShelfPlaylist[]>([]);
  const [liked, setLiked] = useState<SpotifyWebTrack[]>([]);
  const [artists, setArtists] = useState<ShelfArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!active || loaded) return;
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
        setError(failed && failed.status === "rejected" ? message(failed.reason) : null);
        setLoaded(true);
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [active, loaded]);

  const play = (track: SpotifyWebTrack | undefined) => {
    if (!track) return;
    void startFromSong({ artist: track.artist, title: track.title, why: "" }, styles, "Spotify");
    requestMusicTab("dj");
  };

  return (
    <MusicAccountShelf
      connected
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
          .catch((e: unknown) => setError(message(e)))
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

function YouTubeShelf({ active }: { active: boolean }) {
  const t = useT();
  const styles = useStyles();
  const [playlists, setPlaylists] = useState<ShelfPlaylist[]>([]);
  const [liked, setLiked] = useState<YouTubeSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!active || loaded) return;
    let live = true;
    setLoading(true);
    void Promise.allSettled([youtubePlaylists(), youtubeLikedSongs(), youtubeFollowedArtists()])
      .then(([lists, songs, artists]) => {
        if (!live) return;
        if (lists.status === "fulfilled")
          setPlaylists(
            lists.value.map((p) => ({ id: p.id, name: p.name, image: p.image, count: p.count })),
          );
        if (songs.status === "fulfilled") setLiked(songs.value);
        // What they follow and like steers the AI DJ.
        const seeds = [
          ...(artists.status === "fulfilled" ? artists.value : []),
          ...(songs.status === "fulfilled" ? songs.value.map((s) => s.artist) : []),
        ];
        if (seeds.length) setAccountSeeds("youtube", seeds);
        const failed = [lists, songs].find((r) => r.status === "rejected");
        setError(failed && failed.status === "rejected" ? message(failed.reason) : null);
        setLoaded(true);
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [active, loaded]);

  const play = (song: YouTubeSong | undefined) => {
    if (!song) return;
    void startFromSong(
      { artist: song.artist, title: song.title, why: "", videoId: song.videoId },
      styles,
      "YouTube",
    );
    requestMusicTab("dj");
  };

  return (
    <div className="flex flex-col gap-2">
      <MusicAccountShelf
        connected
        provider="YouTube Music"
        loading={loading}
        error={error}
        playlists={playlists}
        liked={liked.map((s) => ({
          id: s.videoId,
          title: s.title,
          artist: s.artist,
          image: s.image,
        }))}
        onConnect={() => void connectYouTubeWeb()}
        onPlaylist={(p) =>
          void youtubePlaylistSongs(p.id)
            .then((songs) => play(songs[0]))
            .catch((e: unknown) => setError(message(e)))
        }
        onLiked={() => play(liked[0])}
        onTrack={(i) => play(liked[i])}
      />
      <button
        type="button"
        onClick={disconnectYouTubeWeb}
        className="self-start text-[12px] font-semibold text-ink-muted hover:text-ink"
      >
        {t("Disconnect YouTube")}
      </button>
    </div>
  );
}
