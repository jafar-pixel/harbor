import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { analyzeSongs, factsKey } from "@/lib/music/automix/analyze";
import {
  addSongs,
  createPlaylist,
  listPlaylists,
  playlistRows,
  type AutoList,
  type AutoSong,
} from "@/lib/music/automix/playlists";
import type { HubService } from "@/lib/music/hub/library";
import { SERVICE_LABEL } from "@/lib/music/hub/library";
import { useMusicLinks } from "@/lib/music/account-link";
import { spotifyLikedTracks } from "@/lib/music/spotify-web/api";
import { connectSpotifyWeb, spotifyCanEdit, useSpotifyWeb } from "@/lib/music/spotify-web/auth";
import { youtubeLikedSongs } from "@/lib/music/youtube-web/api";
import { connectYouTubeWeb, youtubeCanEdit, useYouTubeWeb } from "@/lib/music/youtube-web/auth";
import { isStudioDrag, readStudioDrag, startStudioDrag } from "@/lib/music/studio/drag";
import { songFromDrag } from "@/lib/music/song-drag";
import {
  addToSetlist,
  clearSetlist,
  moveInSetlist,
  removeFromSetlist,
  renameSetlist,
  setlistHas,
  songKey,
  useSetlist,
} from "@/lib/music/studio/setlist";
import { youtubeOnAudioDecks } from "@/lib/music/studio/youtube-audio";
import { DECK_NAMES } from "./studio-deck";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const LIKED = "liked";

/**
 * The playlist mixer: your YouTube Music and Spotify playlists (the ones the Music Hub shows),
 * song by song, ready for the decks. In the desktop app a song goes on the turntables as music
 * (YouTube Music's audio; a Spotify song plays from its YouTube Music match), so it gets the
 * waveform, EQ and sync; on the website YouTube allows only its video decks. Songs can also be
 * gathered into a new playlist and saved to either service.
 */
export function PlaylistSource({
  deckCount,
  busyDeck,
  onSong,
}: {
  deckCount: number;
  busyDeck: number | null;
  onSong: (deck: number, song: AutoSong) => void;
}) {
  const t = useT();
  const links = useMusicLinks();
  const youtube = useYouTubeWeb();
  const spotify = useSpotifyWeb();
  const connected = { youtube: youtube.connected, spotify: spotify.connected };
  const [service, setService] = useState<HubService>(
    links.main && connected[links.main]
      ? links.main
      : connected.spotify && !connected.youtube
        ? "spotify"
        : "youtube",
  );
  const [lists, setLists] = useState<AutoList[]>([]);
  const [list, setList] = useState<string>(LIKED);
  const [songs, setSongs] = useState<AutoSong[] | null>(null);
  const [facts, setFacts] = useState<Map<string, { bpm?: number; key?: string }>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const audio = youtubeOnAudioDecks();
  const on = connected[service];

  useEffect(() => {
    if (!on) return;
    setLists([]);
    setList(LIKED);
    void listPlaylists(service)
      .then(setLists)
      .catch((e: unknown) => setError(message(e)));
  }, [service, on]);

  useEffect(() => {
    if (!on) return;
    let live = true;
    setSongs(null);
    setError(null);
    const load = async (): Promise<AutoSong[]> => {
      if (list === LIKED) {
        if (service === "spotify")
          return (await spotifyLikedTracks(200)).map((s) => ({
            title: s.title,
            artist: s.artist,
            image: s.image,
            uri: s.uri,
          }));
        return (await youtubeLikedSongs()).map((s) => ({
          title: s.title,
          artist: s.artist,
          image: s.image,
          videoId: s.videoId,
        }));
      }
      const found = lists.find((l) => l.id === list);
      if (!found) return [];
      return (await playlistRows(found))
        .filter((r) => r.title && (r.uri || r.videoId))
        .map((r) => ({
          title: r.title,
          artist: r.artist,
          image: r.image,
          uri: r.uri,
          videoId: r.videoId,
        }));
    };
    void load()
      .then((s) => {
        if (!live) return;
        setSongs(s);
        void analyzeSongs(s.slice(0, 200))
          .then((f) => live && setFacts(f))
          .catch(() => undefined);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setError(message(e));
        setSongs([]);
      });
    return () => {
      live = false;
    };
  }, [service, list, lists, on]);

  const withFacts = (s: AutoSong): AutoSong => ({ ...s, ...facts.get(factsKey(s)) });
  const decks = Array.from({ length: deckCount }, (_, i) => i);

  return (
    <div className="sp">
      <div className="sl-bar">
        <div className="sp-services" role="tablist" aria-label={t("Service")}>
          {(["youtube", "spotify"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={service === s}
              className={`studio-btn studio-mini${service === s ? " is-on" : ""}`}
              onClick={() => setService(s)}
            >
              {SERVICE_LABEL[s]}
            </button>
          ))}
        </div>
        {on && (
          <>
            <label className="sr-only" htmlFor="sp-list">
              {t("Playlist")}
            </label>
            <select
              id="sp-list"
              className="studio-search"
              value={list}
              onChange={(e) => setList(e.target.value)}
            >
              <option value={LIKED}>{t("Liked songs")}</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            {songs && songs.length > 0 && (
              <button
                type="button"
                className="studio-btn studio-mini"
                onClick={() => addToSetlist(...songs.map(withFacts))}
              >
                {t("Add all to new playlist")}
              </button>
            )}
          </>
        )}
        <button
          type="button"
          className={`studio-btn studio-mini${building ? " is-on" : ""}`}
          aria-expanded={building}
          onClick={() => setBuilding((b) => !b)}
        >
          {t("New playlist")}
        </button>
      </div>
      {!audio && (
        <p className="studio-empty sp-note">
          {t(
            "On the website YouTube songs play on the video decks. The Windows app mixes them on the turntables as music, with EQ, waveforms and sync.",
          )}
        </p>
      )}
      <div className="sp-body" data-building={building}>
        <div className="sp-songs">
          {!on ? (
            <div className="studio-empty sl-connect">
              <p>
                {t("Connect {service} to mix your playlists here.", {
                  service: SERVICE_LABEL[service],
                })}
              </p>
              <button
                type="button"
                className="studio-btn"
                onClick={() =>
                  service === "spotify" ? void connectSpotifyWeb() : void connectYouTubeWeb()
                }
              >
                {t("Connect {service}", { service: SERVICE_LABEL[service] })}
              </button>
            </div>
          ) : (
            <>
              {error && <p className="studio-error">{error}</p>}
              {!songs ? (
                <p className="studio-empty">{t("Loading…")}</p>
              ) : !songs.length ? (
                <p className="studio-empty">{t("No songs in this playlist.")}</p>
              ) : (
                <div className="sl-table" role="table" aria-label={t("Playlist")}>
                  {songs.map((raw, i) => {
                    const s = withFacts(raw);
                    const added = setlistHas(s);
                    return (
                      <div
                        key={`${i}:${songKey(s)}`}
                        role="row"
                        className="sl-tr"
                        draggable
                        title={t("Drag onto a deck, or use its deck buttons")}
                        onDragStart={(e) => startStudioDrag(e, { kind: "song", song: s })}
                      >
                        <span
                          className="sl-art"
                          style={s.image ? { backgroundImage: `url("${s.image}")` } : undefined}
                        />
                        <span className="sl-title">{s.title}</span>
                        <span className="sl-dim">{s.artist || "—"}</span>
                        <span className="sl-dim">{s.bpm ?? ""}</span>
                        <span className="sl-key">{s.key ?? ""}</span>
                        <button
                          type="button"
                          className="studio-btn studio-mini sp-add"
                          aria-pressed={added}
                          aria-label={
                            added
                              ? t("Remove {title} from the new playlist", { title: s.title })
                              : t("Add {title} to the new playlist", { title: s.title })
                          }
                          onClick={() => (added ? removeFromSetlist(s) : addToSetlist(s))}
                        >
                          {added ? "✓" : "+"}
                        </button>
                        <span className="sl-actions">
                          {decks.map((d) => (
                            <button
                              key={d}
                              type="button"
                              className="studio-btn studio-mini"
                              data-deck={d}
                              disabled={busyDeck === d}
                              onClick={() => onSong(d, s)}
                              title={t("Load on deck {name}", { name: DECK_NAMES[d] })}
                            >
                              {DECK_NAMES[d]}
                            </button>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        {building && <SetlistBuilder />}
      </div>
    </div>
  );
}

/** The new playlist: its name, its songs, and saving it to YouTube Music or Spotify. */
function SetlistBuilder() {
  const t = useT();
  const set = useSetlist();
  const youtube = useYouTubeWeb();
  const spotify = useSpotifyWeb();
  const [saving, setSaving] = useState<HubService | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = set.name || t("My DJ Studio mix");
  const [over, setOver] = useState(false);
  const [from, setFrom] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  // A song slides out before it goes.
  const remove = (s: AutoSong) => {
    setLeaving(songKey(s));
    window.setTimeout(() => {
      removeFromSetlist(s);
      setLeaving(null);
    }, 180);
  };

  const save = async (service: HubService) => {
    setError(null);
    setNote(null);
    const canEdit = service === "spotify" ? spotifyCanEdit() : youtubeCanEdit();
    if (!canEdit) {
      // Saving needs permission to change playlists; the service asks once.
      setNote(
        t("Allow editing in {service}, then press Save again.", {
          service: SERVICE_LABEL[service],
        }),
      );
      if (service === "spotify") void connectSpotifyWeb();
      else void connectYouTubeWeb(true);
      return;
    }
    setSaving(service);
    try {
      const made = await createPlaylist(service, name);
      const added = await addSongs(made, set.songs);
      setNote(
        t("Saved {n} songs to “{name}” on {service}.", {
          n: added,
          name,
          service: SERVICE_LABEL[service],
        }),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <aside
      className="sp-build"
      aria-label={t("New playlist")}
      data-drop={over || undefined}
      onDragOver={(e) => {
        if (!isStudioDrag(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!isStudioDrag(e)) return;
        e.preventDefault();
        setOver(false);
        const drag = readStudioDrag(e);
        const song = drag ? songFromDrag(drag) : null;
        if (song) addToSetlist(song);
      }}
    >
      <strong>{t("New playlist")}</strong>
      <label className="sr-only" htmlFor="sp-name">
        {t("Playlist name")}
      </label>
      <input
        id="sp-name"
        className="studio-search"
        value={set.name}
        placeholder={t("My DJ Studio mix")}
        onChange={(e) => renameSetlist(e.target.value)}
      />
      {set.played.length > 0 && (
        <button
          type="button"
          className="studio-btn studio-mini"
          onClick={() => addToSetlist(...set.played)}
        >
          {t("Add what's been on the decks ({n})", { n: set.played.length })}
        </button>
      )}
      {set.songs.length === 0 ? (
        <p className="studio-empty">
          {t("Press + on a song or drag it here. Songs you load on a deck can be added in one go.")}
        </p>
      ) : (
        <ol className="sp-build-list">
          {set.songs.map((s, i) => (
            <li
              key={songKey(s)}
              data-leaving={leaving === songKey(s) || undefined}
              draggable
              title={t("Drag to move it, or onto a deck or the player")}
              onDragStart={(e) => {
                setFrom(i);
                startStudioDrag(e, { kind: "song", song: s });
              }}
              onDragEnd={() => setFrom(null)}
              onDrop={(e) => {
                if (from === null) return;
                e.preventDefault();
                e.stopPropagation();
                setOver(false);
                moveInSetlist(from, i);
                setFrom(null);
              }}
            >
              <span className="sp-build-song">
                <span>{s.title}</span>
                <span className="sl-dim">{s.artist}</span>
              </span>
              <button
                type="button"
                className="studio-btn studio-mini"
                aria-label={t("Remove {title}", { title: s.title })}
                onClick={() => remove(s)}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="sp-build-save">
        {(["youtube", "spotify"] as const).map((s) => {
          const connected = s === "spotify" ? spotify.connected : youtube.connected;
          if (!connected) return null;
          return (
            <button
              key={s}
              type="button"
              className="studio-btn"
              disabled={!set.songs.length || saving !== null}
              onClick={() => void save(s)}
            >
              {saving === s ? t("Saving…") : t("Save to {service}", { service: SERVICE_LABEL[s] })}
            </button>
          );
        })}
        {set.songs.length > 0 && (
          <button type="button" className="studio-btn studio-mini" onClick={clearSetlist}>
            {t("Clear")}
          </button>
        )}
      </div>
      {note && <p className="studio-empty">{note}</p>}
      {error && <p className="studio-error">{error}</p>}
    </aside>
  );
}
