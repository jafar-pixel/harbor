import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ExternalLink, Heart, ListMusic, LogOut, Play, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import { setAccountSeeds } from "@/lib/music/dj/account-seeds";
import { startDj, startFromSong } from "@/lib/music/dj/session";
import type { Vibe } from "@/lib/music/dj/vibes";
import { requestMusicTab } from "@/lib/music/social/inbox";
import {
  spotifyLikedTracks,
  spotifyPlaylists,
  spotifyPlaylistTracks,
  spotifyProfile,
  spotifyTopArtists,
  spotifyTopTracks,
  type SpotifyWebArtist,
  type SpotifyWebPlaylist,
  type SpotifyWebProfile,
  type SpotifyWebTrack,
} from "@/lib/music/spotify-web/api";
import {
  connectSpotifyWeb,
  disconnectSpotifyWeb,
  useSpotifyWeb,
} from "@/lib/music/spotify-web/auth";
import { useSettings } from "@/lib/settings";
import "./music-friends.css";
import "./music-spotify.css";

const SPOTIFY_COLORS: [string, string] = ["#1db954", "#0b3d1f"];

type Loaded = {
  profile: SpotifyWebProfile;
  artists: SpotifyWebArtist[];
  top: SpotifyWebTrack[];
  playlists: SpotifyWebPlaylist[];
};

/**
 * Spotify in the web app: sign in with your own account, then your top artists, what you've had
 * on repeat, your playlists and liked songs. Songs play through the AI DJ (YouTube), which keeps
 * going in the same feel; your top artists also steer every DJ set.
 */
export function MusicSpotify({ active }: { active: boolean }) {
  const t = useT();
  const spotify = useSpotifyWeb();
  const { settings } = useSettings();
  const styles = settings.musicStyles ?? [];
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ title: string; tracks: SpotifyWebTrack[] | null } | null>(
    null,
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profile, artists, top, playlists] = await Promise.all([
        spotifyProfile(),
        spotifyTopArtists(20),
        spotifyTopTracks(20),
        spotifyPlaylists(50),
      ]);
      setAccountSeeds(
        "spotify",
        artists.map((a) => a.name),
      );
      setData({ profile, artists, top, playlists });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (active && spotify.connected && !data) void load();
  }, [active, spotify.connected, data, load]);

  const play = (track: SpotifyWebTrack) => {
    void startFromSong({ artist: track.artist, title: track.title, why: "" }, styles, "Spotify");
    requestMusicTab("dj");
  };

  const djAround = (vibe: Vibe) => {
    void startDj(vibe, styles);
    requestMusicTab("dj");
  };

  const openList = async (title: string, loadTracks: () => Promise<SpotifyWebTrack[]>) => {
    setOpen({ title, tracks: null });
    try {
      setOpen({ title, tracks: await loadTracks() });
    } catch (e) {
      setOpen(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!spotify.connected) {
    return (
      <section className="music-spotify-connect music-friends">
        <span className="music-spotify-logo" aria-hidden="true" />
        <h2>{t("Bring your Spotify")}</h2>
        <p>
          {t(
            "Sign in with your own Spotify account. Your top artists steer the AI DJ, and your playlists and liked songs play right here.",
          )}
        </p>
        {(spotify.error || error) && (
          <p className="music-friends-message">{spotify.error || error}</p>
        )}
        <button
          type="button"
          className="music-spotify-go"
          disabled={spotify.finishing}
          onClick={() => void connectSpotifyWeb()}
        >
          {spotify.finishing ? t("Finishing sign in…") : t("Connect Spotify")}
        </button>
        <p className="music-friends-muted">
          {t(
            "While JL Media Vision's Spotify app is new, Spotify only lets in accounts the owner has added. Ask them to add your Spotify email if sign in is refused.",
          )}
        </p>
      </section>
    );
  }

  if (open) {
    return (
      <section className="music-spotify music-friends">
        <header className="music-spotify-bar">
          <button type="button" onClick={() => setOpen(null)}>
            <ChevronLeft size={16} /> {t("Back")}
          </button>
          <h2>{open.title}</h2>
        </header>
        {open.tracks === null ? (
          <p className="music-friends-muted">{t("Loading…")}</p>
        ) : (
          <TrackList tracks={open.tracks} onPlay={play} />
        )}
      </section>
    );
  }

  return (
    <section className="music-spotify music-friends">
      {error && <p className="music-friends-message">{error}</p>}
      <header className="music-spotify-bar">
        {data?.profile.image ? (
          <img className="music-spotify-me" src={data.profile.image} alt="" />
        ) : (
          <span className="music-spotify-logo" aria-hidden="true" />
        )}
        <div>
          <h2>{data?.profile.name ?? t("Spotify")}</h2>
          <p className="music-friends-muted">
            {data?.profile.product === "premium" ? t("Spotify Premium") : t("Spotify connected")}
          </p>
        </div>
        {data && data.artists.length > 0 && (
          <button
            type="button"
            className="music-spotify-go"
            onClick={() =>
              djAround({
                id: "spotify-mix",
                name: t("My Spotify mix"),
                prompt: `A set for someone whose top artists are ${data.artists
                  .slice(0, 10)
                  .map((a) => a.name)
                  .join(", ")}: their favourites mixed with new artists in the same lane`,
                colors: SPOTIFY_COLORS,
              })
            }
          >
            <Sparkles size={16} /> {t("Mix my Spotify")}
          </button>
        )}
        <button type="button" onClick={disconnectSpotifyWeb}>
          <LogOut size={15} /> {t("Disconnect")}
        </button>
      </header>

      {!data ? (
        <p className="music-friends-muted">{t("Loading your Spotify…")}</p>
      ) : (
        <>
          {data.artists.length > 0 && (
            <section>
              <h3 className="music-friends-h">{t("Your top artists")}</h3>
              <ul className="music-spotify-artists">
                {data.artists.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      title={t("Start a DJ set around {name}", { name: a.name })}
                      onClick={() =>
                        djAround({
                          id: `spotify-artist-${a.id}`,
                          name: a.name,
                          prompt: `Songs by ${a.name} and artists who sound like them${
                            a.genres.length ? ` (${a.genres.slice(0, 3).join(", ")})` : ""
                          }`,
                          colors: SPOTIFY_COLORS,
                        })
                      }
                    >
                      {a.image ? <img src={a.image} alt="" loading="lazy" /> : <span />}
                      <strong>{a.name}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.top.length > 0 && (
            <section>
              <h3 className="music-friends-h">{t("On repeat")}</h3>
              <TrackList tracks={data.top.slice(0, 10)} onPlay={play} />
            </section>
          )}

          <section>
            <h3 className="music-friends-h">{t("Your library")}</h3>
            <ul className="music-spotify-playlists">
              <li>
                <button
                  type="button"
                  onClick={() => void openList(t("Liked songs"), () => spotifyLikedTracks(50))}
                >
                  <span className="music-spotify-liked">
                    <Heart size={22} fill="currentColor" />
                  </span>
                  <strong>{t("Liked songs")}</strong>
                </button>
              </li>
              {data.playlists.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => void openList(p.name, () => spotifyPlaylistTracks(p.id))}
                  >
                    {p.image ? (
                      <img src={p.image} alt="" loading="lazy" />
                    ) : (
                      <span className="music-spotify-liked">
                        <ListMusic size={22} />
                      </span>
                    )}
                    <strong>{p.name}</strong>
                    <em>{t("{count} songs", { count: String(p.count) })}</em>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}

function TrackList({
  tracks,
  onPlay,
}: {
  tracks: SpotifyWebTrack[];
  onPlay: (track: SpotifyWebTrack) => void;
}) {
  const t = useT();
  if (!tracks.length) return <p className="music-friends-muted">{t("Nothing here yet.")}</p>;
  return (
    <ul className="music-friends-inbox">
      {tracks.map((track) => (
        <li key={track.id}>
          {track.image ? (
            <img src={track.image} alt="" loading="lazy" />
          ) : (
            <span className="music-friends-thumb" />
          )}
          <div>
            <strong>{track.title}</strong>
            <span>
              {track.artist}
              {track.album ? ` · ${track.album}` : ""}
            </span>
          </div>
          <button type="button" onClick={() => onPlay(track)}>
            <Play size={15} /> {t("Play")}
          </button>
          {track.url && (
            <a
              href={track.url}
              target="_blank"
              rel="noreferrer"
              aria-label={t("Open in Spotify")}
              className="music-spotify-out"
            >
              <ExternalLink size={15} />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
