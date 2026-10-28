import { Clapperboard, Play, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { removeFoundSong, useFoundSongs, type FoundSong } from "@/lib/music/found-songs";
import { playTracks } from "@/lib/music/player/store";

const track = (s: FoundSong) => ({
  source: "song" as const,
  title: s.title,
  artist: s.artist,
  album: s.album || undefined,
  art: s.art,
});

/** Songs saved with song ID during a movie or show, to listen to afterwards. */
export function FoundWhileWatching() {
  const t = useT();
  const songs = useFoundSongs();
  if (!songs.length) return null;
  const context = t("Found while watching");
  return (
    <section className="hub-section" aria-label={context}>
      <div className="hub-section-head">
        <h3>{context}</h3>
        <button
          type="button"
          className="hub-pill"
          onClick={() => playTracks(songs.map(track), 0, context)}
        >
          <Play size={14} /> {t("Play all")}
        </button>
      </div>
      <ul className="hub-found">
        {songs.map((s, i) => (
          <li key={`${s.artist}-${s.title}`} className="hub-found-row">
            <button
              type="button"
              className="hub-found-song"
              onClick={() => playTracks(songs.map(track), i, context)}
            >
              {s.art ? <img src={s.art} alt="" loading="lazy" /> : <span className="hub-noart" />}
              <span className="hub-found-text">
                <strong>{s.title}</strong>
                <span>{s.artist}</span>
              </span>
            </button>
            <span className="hub-found-from">
              {s.heardIn && (
                <>
                  <Clapperboard size={13} /> {s.heardIn}
                </>
              )}
              {s.onYouTube && <em>{t("On your YouTube playlist")}</em>}
            </span>
            <button
              type="button"
              className="hub-found-remove"
              aria-label={t("Remove {name}", { name: s.title })}
              onClick={() => removeFoundSong(s)}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
