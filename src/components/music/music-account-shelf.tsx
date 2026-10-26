import { Heart, Play, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import "./music-account-shelf.css";

export type ShelfPlaylist = { id: string; name: string; image: string | null; count?: number };
export type ShelfTrack = { id: string; title: string; artist: string; image: string | null };
export type ShelfArtist = { id: string; name: string; image: string | null };

/**
 * The top of For you: the listener's own music from their connected account. Playlists as
 * cover posters (Liked songs first), what they've liked lately, and their top artists when the
 * account shares them. Before anything is connected it invites them to connect.
 */
export function MusicAccountShelf({
  connected,
  provider,
  loading,
  error,
  playlists,
  liked,
  artists = [],
  onConnect,
  onConnectYouTube,
  onPlaylist,
  onLiked,
  onTrack,
  onArtist,
  onSeeAll,
}: {
  connected: boolean;
  provider: string;
  loading: boolean;
  error: string | null;
  playlists: ShelfPlaylist[];
  liked: ShelfTrack[];
  artists?: ShelfArtist[];
  onConnect: () => void;
  onConnectYouTube?: () => void;
  onPlaylist: (playlist: ShelfPlaylist) => void;
  onLiked: () => void;
  onTrack: (index: number) => void;
  onArtist?: (artist: ShelfArtist) => void;
  onSeeAll?: () => void;
}) {
  const t = useT();
  if (!connected) {
    return (
      <section className="music-shelf-invite">
        <div>
          <h2>{t("Make For you yours")}</h2>
          <p>
            {t(
              "Connect your Spotify or YouTube and this page fills with your playlists, the songs you love and your top artists.",
            )}
          </p>
        </div>
        <div className="music-shelf-invite-actions">
          <button type="button" className="music-shelf-spotify" onClick={onConnect}>
            {t("Connect Spotify")}
          </button>
          {onConnectYouTube && (
            <button type="button" className="music-shelf-youtube" onClick={onConnectYouTube}>
              {t("Connect YouTube")}
            </button>
          )}
        </div>
      </section>
    );
  }

  const likedCover = liked.find((s) => s.image)?.image ?? null;
  return (
    <section className="music-shelf" aria-label={t("Your {provider}", { provider })}>
      <header className="music-shelf-head">
        <h2>{t("Your {provider}", { provider })}</h2>
        {onSeeAll && (
          <button type="button" onClick={onSeeAll}>
            {t("See all")}
          </button>
        )}
      </header>
      {error && <p className="music-shelf-error">{error}</p>}

      <ul className="music-shelf-playlists">
        <li>
          <button type="button" className="music-shelf-poster" onClick={onLiked}>
            <span className="music-shelf-liked">
              {likedCover && <img src={likedCover} alt="" loading="lazy" />}
              <Heart size={34} fill="currentColor" />
            </span>
            <strong>{t("Liked songs")}</strong>
            <em>{liked.length ? t("Play your favourites") : t("Your saved songs")}</em>
            <span className="music-shelf-play" aria-hidden="true">
              <Play size={18} fill="currentColor" />
            </span>
          </button>
        </li>
        {loading && !playlists.length
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i}>
                <span className="music-shelf-poster music-shelf-skeleton" />
              </li>
            ))
          : playlists.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="music-shelf-poster"
                  title={t("Play {name}", { name: p.name })}
                  onClick={() => onPlaylist(p)}
                >
                  <span className="music-shelf-cover">
                    {p.image ? <img src={p.image} alt="" loading="lazy" /> : <Sparkles size={30} />}
                  </span>
                  <strong>{p.name}</strong>
                  {typeof p.count === "number" && (
                    <em>{t("{count} songs", { count: String(p.count) })}</em>
                  )}
                  <span className="music-shelf-play" aria-hidden="true">
                    <Play size={18} fill="currentColor" />
                  </span>
                </button>
              </li>
            ))}
      </ul>

      {artists.length > 0 && (
        <>
          <h3 className="music-shelf-h">{t("Your top artists")}</h3>
          <ul className="music-shelf-artists">
            {artists.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => onArtist?.(a)}>
                  {a.image ? <img src={a.image} alt="" loading="lazy" /> : <span />}
                  <strong>{a.name}</strong>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {liked.length > 0 && (
        <>
          <h3 className="music-shelf-h">{t("Recently liked")}</h3>
          <ul className="music-shelf-tracks">
            {liked.slice(0, 12).map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => onTrack(i)}>
                  <span className="music-shelf-track-art">
                    {s.image && <img src={s.image} alt="" loading="lazy" />}
                    <span className="music-shelf-play" aria-hidden="true">
                      <Play size={14} fill="currentColor" />
                    </span>
                  </span>
                  <span>
                    <strong>{s.title}</strong>
                    <em>{s.artist}</em>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
