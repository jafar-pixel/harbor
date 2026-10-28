import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { analyzeSongs, factsKey } from "@/lib/music/automix/analyze";
import {
  connectJellyfin,
  disconnectJellyfin,
  jellyfinRecent,
  jellyfinSearch,
  jellyfinStreamUrl,
  useJellyfin,
  type JellyfinSong,
} from "@/lib/music/jellyfin-web";
import type { StudioDeck } from "@/lib/music/studio/deck";
import { addUrl } from "@/lib/music/studio/library";
import { loadVideoDeck, type VideoSong } from "@/lib/music/studio/video-decks";
import {
  youtubeLikedSongs,
  youtubePlaylists,
  youtubePlaylistSongs,
  type YouTubePlaylist,
  type YouTubeSong,
} from "@/lib/music/youtube-web/api";
import { connectYouTubeWeb, useYouTubeWeb } from "@/lib/music/youtube-web/auth";
import { formatTime } from "./studio-controls";
import { DECK_NAMES } from "./studio-deck";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Your YouTube Music (liked songs and playlists) for the video decks. */
export function YouTubeSource({ onVideo }: { onVideo: () => void }) {
  const t = useT();
  const youtube = useYouTubeWeb();
  const [lists, setLists] = useState<YouTubePlaylist[]>([]);
  const [list, setList] = useState<string>("liked");
  const [songs, setSongs] = useState<YouTubeSong[] | null>(null);
  const [facts, setFacts] = useState<Map<string, { bpm?: number; key?: string }>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!youtube.connected) return;
    void youtubePlaylists()
      .then(setLists)
      .catch((e: unknown) => setError(message(e)));
  }, [youtube.connected]);

  useEffect(() => {
    if (!youtube.connected) return;
    setSongs(null);
    void (list === "liked" ? youtubeLikedSongs() : youtubePlaylistSongs(list))
      .then((s) => {
        setSongs(s);
        void analyzeSongs(s.map((x) => ({ artist: x.artist, title: x.title })))
          .then(setFacts)
          .catch(() => undefined);
      })
      .catch((e: unknown) => {
        setError(message(e));
        setSongs([]);
      });
  }, [list, youtube.connected]);

  if (!youtube.connected)
    return (
      <div className="studio-empty sl-connect">
        <p>{t("Connect YouTube Music to mix its videos on the video decks.")}</p>
        <button type="button" className="studio-btn" onClick={() => void connectYouTubeWeb()}>
          {t("Connect YouTube Music")}
        </button>
      </div>
    );

  const load = (i: 0 | 1, s: YouTubeSong) => {
    const f = facts.get(factsKey(s)) ?? {};
    const song: VideoSong = {
      videoId: s.videoId,
      title: s.title,
      artist: s.artist,
      art: s.image,
      bpm: f.bpm,
      key: f.key,
    };
    onVideo();
    void loadVideoDeck(i, song);
  };

  return (
    <>
      <div className="sl-bar">
        <strong>{t("YouTube Music")}</strong>
        <label className="sr-only" htmlFor="sl-yt-list">
          {t("Playlist")}
        </label>
        <select
          id="sl-yt-list"
          className="studio-search"
          value={list}
          onChange={(e) => setList(e.target.value)}
        >
          <option value="liked">{t("Liked songs")}</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="studio-error">{error}</p>}
      {!songs ? (
        <p className="studio-empty">{t("Loading…")}</p>
      ) : (
        <div className="sl-table" role="table" aria-label={t("YouTube Music")}>
          {songs.map((s) => {
            const f = facts.get(factsKey(s)) ?? {};
            return (
              <div key={s.videoId} role="row" className="sl-tr">
                <span
                  className="sl-art"
                  style={s.image ? { backgroundImage: `url("${s.image}")` } : undefined}
                />
                <span className="sl-title">{s.title}</span>
                <span className="sl-dim">{s.artist || "—"}</span>
                <span className="sl-dim">{f.bpm ?? ""}</span>
                <span className="sl-key">{f.key ?? ""}</span>
                <span className="sl-dim">{t("Video")}</span>
                <span className="sl-actions">
                  {([0, 1] as const).map((i) => (
                    <button
                      key={i}
                      type="button"
                      className="studio-btn studio-mini"
                      data-deck={i}
                      onClick={() => load(i, s)}
                      title={t("Load on video deck {name}", { name: DECK_NAMES[i] })}
                    >
                      {DECK_NAMES[i]}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Your Jellyfin server's music for the audio decks. */
export function JellyfinSource({
  decks,
  onLoad,
  busyDeck,
}: {
  decks: StudioDeck[];
  onLoad: (deck: StudioDeck, id: string) => void;
  busyDeck: number | null;
}) {
  const t = useT();
  const jf = useJellyfin();
  const [form, setForm] = useState({ server: "", user: "", password: "" });
  const [songs, setSongs] = useState<JellyfinSong[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jf.session) return;
    setSongs(null);
    const q = query.trim();
    const id = window.setTimeout(
      () =>
        void (q ? jellyfinSearch(q) : jellyfinRecent()).then(setSongs).catch((e: unknown) => {
          setError(message(e));
          setSongs([]);
        }),
      q ? 350 : 0,
    );
    return () => window.clearTimeout(id);
  }, [jf.session, query]);

  if (!jf.session)
    return (
      <form
        className="sl-jellyfin"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          void connectJellyfin(form.server, form.user, form.password)
            .catch((err: unknown) => setError(message(err)))
            .finally(() => setBusy(false));
        }}
      >
        <strong>{t("Connect your Jellyfin server")}</strong>
        <p className="studio-empty">
          {t("Use its HTTPS address. Your sign in stays on this device.")}
        </p>
        <label>
          <span>{t("Server address")}</span>
          <input
            value={form.server}
            placeholder="https://jellyfin.example.com"
            onChange={(e) => setForm({ ...form, server: e.target.value })}
          />
        </label>
        <label>
          <span>{t("Username")}</span>
          <input
            value={form.user}
            autoComplete="username"
            onChange={(e) => setForm({ ...form, user: e.target.value })}
          />
        </label>
        <label>
          <span>{t("Password")}</span>
          <input
            type="password"
            value={form.password}
            autoComplete="current-password"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {error && <p className="studio-error">{error}</p>}
        <button type="submit" className="studio-btn" disabled={busy || !form.server || !form.user}>
          {busy ? t("Connecting…") : t("Connect")}
        </button>
      </form>
    );

  const add = (s: JellyfinSong) => addUrl(jellyfinStreamUrl(s.id), s.title, s.artist, s.art);

  return (
    <>
      <div className="sl-bar">
        <strong>{t("Jellyfin")}</strong>
        <span className="sl-count">{jf.session.name}</span>
        <input
          className="studio-search"
          type="search"
          placeholder={t("Search your Jellyfin music")}
          aria-label={t("Search Jellyfin")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="studio-btn studio-mini" onClick={disconnectJellyfin}>
          {t("Disconnect")}
        </button>
      </div>
      {error && <p className="studio-error">{error}</p>}
      {!songs ? (
        <p className="studio-empty">{t("Loading…")}</p>
      ) : songs.length === 0 ? (
        <p className="studio-empty">{t("No songs found.")}</p>
      ) : (
        <div className="sl-table" role="table" aria-label={t("Jellyfin")}>
          {songs.map((s) => (
            <div key={s.id} role="row" className="sl-tr">
              <span
                className="sl-art"
                style={s.art ? { backgroundImage: `url("${s.art}")` } : undefined}
              />
              <span className="sl-title">{s.title}</span>
              <span className="sl-dim">{s.artist || "—"}</span>
              <span className="sl-dim" />
              <span className="sl-key" />
              <span className="sl-dim">{s.durationSec ? formatTime(s.durationSec) : ""}</span>
              <span className="sl-actions">
                {decks.map((deck) => (
                  <button
                    key={deck.index}
                    type="button"
                    className="studio-btn studio-mini"
                    data-deck={deck.index}
                    disabled={busyDeck === deck.index}
                    onClick={() => onLoad(deck, add(s).id)}
                    title={t("Load on deck {name}", { name: DECK_NAMES[deck.index] })}
                  >
                    {DECK_NAMES[deck.index]}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
