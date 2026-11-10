import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Disc3, ListPlus, MoreHorizontal, Play, Search, Settings2, Shuffle, X } from "lucide-react";
import jlLogo from "@/assets/brand/jl-logo.webp";
import { useT } from "@/lib/i18n";
import { useMusicLinks, type MainService } from "@/lib/music/account-link";
import {
  categorySongs,
  formatDuration,
  HUB_CATEGORIES,
  hubPlaylistSongs,
  loadHubLibrary,
  playerTrack,
  searchHub,
  SERVICE_LABEL,
  type HubCategory,
  type HubLibrary,
  type HubPlaylist,
  type HubSong,
} from "@/lib/music/hub/library";
import { addToQueue, playNext, playTracks, usePlayer } from "@/lib/music/player/store";
import { useSpotifyWeb } from "@/lib/music/spotify-web/auth";
import { useYouTubeWeb } from "@/lib/music/youtube-web/auth";
import { startStudioDrag } from "@/lib/music/studio/drag";
import { hubDragSong } from "@/lib/music/song-drag";
import { FoundWhileWatching } from "./found-while-watching";
import { HubCoverflow, type CoverflowSlide } from "./hub-coverflow";
import { MusicHubSettings } from "./hub-settings";
import "./music-hub.css";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The Music Hub: the listener's YouTube Music and Spotify in one place. Their playlists side by
 * side, what they liked lately, search across both and browse by new, charts, genres and moods.
 * Everything plays through the shared player, so it can be queued, mixed or sent to the Lounge.
 */
export function MusicHub({ active, onStudio }: { active: boolean; onStudio: () => void }) {
  const t = useT();
  const youtube = useYouTubeWeb();
  const spotify = useSpotifyWeb();
  const links = useMusicLinks();
  // Until the listener picks, YouTube (the recommended service) leads the lists.
  const main: MainService = links.main ?? "youtube";
  const connected = useMemo(
    () => ({ youtube: youtube.connected, spotify: spotify.connected }),
    [youtube.connected, spotify.connected],
  );
  const [library, setLibrary] = useState<HubLibrary | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [results, setResults] = useState<{ title: string; songs: HubSong[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("new");
  const [allLists, setAllLists] = useState(false);
  const [allRecent, setAllRecent] = useState(false);
  const searchRun = useRef(0);
  const [flowAt, setFlowAt] = useState(0);

  useEffect(() => {
    if (!active || (!connected.youtube && !connected.spotify)) return;
    let live = true;
    setLoading(true);
    void loadHubLibrary(connected, main)
      .then((lib) => live && setLibrary(lib))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [active, connected, main]);

  const runSearch = async (title: string, load: () => Promise<HubSong[]>) => {
    const run = ++searchRun.current;
    setSearching(true);
    setError(null);
    setResults({ title, songs: [] });
    try {
      const songs = await load();
      if (run === searchRun.current) setResults({ title, songs });
    } catch (e) {
      if (run === searchRun.current) setError(message(e));
    } finally {
      if (run === searchRun.current) setSearching(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    void runSearch(`${t("Results for")} “${q}”`, async () => {
      const out = await searchHub(q, connected.spotify);
      if (out.error) throw new Error(out.error);
      return out.songs;
    });
  };

  const openCategory = (c: HubCategory) => void runSearch(c.label, () => categorySongs(c));
  const openPlaylist = (p: HubPlaylist) =>
    void runSearch(`${SERVICE_LABEL[p.service]} · ${p.name}`, () => hubPlaylistSongs(p));

  const playPlaylist = (p: HubPlaylist, shuffle = false) =>
    void hubPlaylistSongs(p)
      .then((songs) => {
        if (!songs.length) throw new Error(t("That playlist is empty."));
        const list = shuffle ? [...songs].sort(() => Math.random() - 0.5) : songs;
        playTracks(list.map(playerTrack), 0, `${SERVICE_LABEL[p.service]} · ${p.name}`);
      })
      .catch((e: unknown) => setError(message(e)));

  const nothingConnected = !connected.youtube && !connected.spotify;
  const recent = library?.recent ?? [];
  const group = HUB_CATEGORIES.find((g) => g.id === category) ?? HUB_CATEGORIES[0];
  const playlists = library?.playlists ?? [];
  // The listener's playlists are the carousel; with fewer than three, liked songs join them.
  const byPlaylists = playlists.length >= 3;
  const slides = byPlaylists
    ? playlists.map((p) => playlistSlide(p, t, playPlaylist, openPlaylist))
    : mixedSlides(library, t, playPlaylist, openPlaylist);
  const staged = slides.length >= 3;
  const shuffleMine = () =>
    playTracks(
      [...recent].sort(() => Math.random() - 0.5).map(playerTrack),
      0,
      t("Your liked songs"),
    );

  return (
    <div className="hub">
      <header className="hub-head">
        <div>
          <h2 className="hub-title">{t("Music Hub")}</h2>
          <p className="hub-sub">{t("Discover, create and manage your sound")}</p>
        </div>
        <form className="hub-search" role="search" onSubmit={submit}>
          <Search size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="hub-search-input">
            {t("Search music, artists or playlists")}
          </label>
          <input
            id="hub-search-input"
            type="search"
            value={query}
            placeholder={t("Search music, artists or playlists…")}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="hub-icon"
              aria-label={t("Clear search")}
              onClick={() => {
                setQuery("");
                setResults(null);
              }}
            >
              <X size={16} />
            </button>
          )}
        </form>
        <button
          type="button"
          className="hub-settings-open"
          onClick={() => setSettingsOpen(true)}
          aria-label={t("Music settings")}
        >
          <Settings2 size={18} /> {t("Music settings")}
        </button>
      </header>
      {settingsOpen && <MusicHubSettings onClose={() => setSettingsOpen(false)} />}

      {staged ? (
        <>
          <div className="hub-stage" data-list={byPlaylists}>
            {byPlaylists && (
              <nav className="hub-lists" aria-label={t("Playlists")}>
                <h3>{t("Playlists")}</h3>
                <ul>
                  {playlists.map((p, i) => (
                    <li key={`${p.service}:${p.id}`}>
                      <button
                        type="button"
                        aria-current={i === flowAt % playlists.length ? "true" : undefined}
                        onClick={() => setFlowAt(i)}
                        onDoubleClick={() => playPlaylist(p)}
                      >
                        {p.image ? (
                          <img src={p.image} alt="" loading="lazy" />
                        ) : (
                          <span className="hub-lists-noart" aria-hidden="true" />
                        )}
                        <span className="hub-lists-text">
                          <span className="hub-lists-name">{p.name}</span>
                          <span className="hub-muted">
                            {SERVICE_LABEL[p.service]} · {p.count}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <HubCoverflow
              slides={slides}
              active={byPlaylists ? flowAt : undefined}
              onActive={byPlaylists ? setFlowAt : undefined}
            />
          </div>
          {library?.errors &&
            Object.entries(library.errors).map(([sv, e]) => (
              <p key={sv} className="hub-error">
                {SERVICE_LABEL[sv as keyof typeof SERVICE_LABEL]}: {e}
              </p>
            ))}
          <div className="hub-flow-actions">
            <button type="button" className="hub-cta" onClick={shuffleMine}>
              <Shuffle size={18} /> {t("Shuffle my music")}
            </button>
            <button type="button" className="hub-ghost" onClick={onStudio}>
              <Disc3 size={18} /> {t("Turntables")}
            </button>
          </div>
        </>
      ) : (
        <section className="hub-hero" aria-label={t("Music Hub")}>
          <div className="hub-hero-text">
            <p className="hub-eyebrow">{t("By JL Media Vision")}</p>
            <h3>{t("Sound powers your story")}</h3>
            <div className="hub-hero-actions">
              <button
                type="button"
                className="hub-cta"
                disabled={!recent.length}
                onClick={shuffleMine}
              >
                <Shuffle size={18} /> {t("Shuffle my music")}
              </button>
              <button type="button" className="hub-ghost" onClick={onStudio}>
                <Disc3 size={18} /> {t("Turntables")}
              </button>
            </div>
            {(youtube.error || spotify.error) && (
              <p className="hub-error">{youtube.error || spotify.error}</p>
            )}
          </div>
          <div className="hub-hero-art" aria-hidden="true">
            <div className="hub-eq">
              {Array.from({ length: 28 }, (_, i) => (
                <span key={i} style={{ animationDelay: `${(i % 7) * -0.17}s` }} />
              ))}
            </div>
            <img src={jlLogo} alt="" className="hub-logo" />
          </div>
        </section>
      )}

      {error && <p className="hub-error">{error}</p>}

      {results && (
        <section className="hub-section" aria-label={results.title}>
          <div className="hub-section-head">
            <h3>{results.title}</h3>
            <div className="hub-section-actions">
              {results.songs.length > 0 && (
                <button
                  type="button"
                  className="hub-pill"
                  onClick={() => playTracks(results.songs.map(playerTrack), 0, results.title)}
                >
                  <Play size={14} /> {t("Play all")}
                </button>
              )}
              <button
                type="button"
                className="hub-icon"
                aria-label={t("Close results")}
                onClick={() => setResults(null)}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {searching ? (
            <p className="hub-muted">{t("Searching…")}</p>
          ) : results.songs.length ? (
            <SongTable songs={results.songs} context={results.title} />
          ) : (
            <p className="hub-muted">{t("Nothing found. Try other words.")}</p>
          )}
        </section>
      )}

      <FoundWhileWatching />

      {nothingConnected ? (
        <section className="hub-connect">
          <h3>{t("Connect once, stay connected")}</h3>
          <p>
            {t(
              "Connect YouTube Music or Spotify and the Hub fills with your playlists and the songs you love. It stays connected on every device you sign in to.",
            )}
          </p>
          <button
            type="button"
            className="hub-pill hub-pill-strong"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={14} /> {t("Open Music settings")}
          </button>
        </section>
      ) : staged ? null : (
        <section className="hub-section" aria-label={t("Featured playlists")}>
          <div className="hub-section-head">
            <h3>{t("Featured playlists")}</h3>
            {loading && <span className="hub-muted">{t("Loading…")}</span>}
            {(library?.playlists.length ?? 0) > 18 && (
              <button type="button" className="hub-pill" onClick={() => setAllLists((v) => !v)}>
                {allLists
                  ? t("Show fewer")
                  : `${t("Show all")} (${library?.playlists.length ?? 0})`}
              </button>
            )}
          </div>
          <div className="hub-playlists">
            {(library?.playlists ?? []).slice(0, allLists ? undefined : 18).map((p) => (
              <article key={`${p.service}:${p.id}`} className="hub-playlist">
                <button
                  type="button"
                  className="hub-playlist-art"
                  aria-label={`${t("Play")} ${p.name}`}
                  onClick={() => playPlaylist(p)}
                >
                  {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span />}
                  <span className="hub-play-dot" aria-hidden="true">
                    <Play size={18} />
                  </span>
                </button>
                <div className="hub-playlist-meta">
                  <button
                    type="button"
                    className="hub-playlist-name"
                    title={t("Show songs")}
                    onClick={() => openPlaylist(p)}
                  >
                    {p.name}
                  </button>
                  <span className="hub-muted">
                    {SERVICE_LABEL[p.service]} · {p.count} {t("tracks")}
                  </span>
                </div>
              </article>
            ))}
          </div>
          {library?.errors &&
            Object.entries(library.errors).map(([s, e]) => (
              <p key={s} className="hub-error">
                {SERVICE_LABEL[s as keyof typeof SERVICE_LABEL]}: {e}
              </p>
            ))}
        </section>
      )}

      <section className="hub-section" aria-label={t("Browse")}>
        <div className="hub-section-head">
          <h3>{t("Browse")}</h3>
          <div role="tablist" aria-label={t("Browse")} className="hub-tabs">
            {HUB_CATEGORIES.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={category === g.id}
                onClick={() => setCategory(g.id)}
              >
                {t(g.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="hub-categories">
          {group.items.map((c) => (
            <button
              key={c.id}
              type="button"
              className="hub-category"
              onClick={() => openCategory(c)}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="hub-section" aria-label={t("Recently added")}>
          <div className="hub-section-head">
            <h3>{t("Recently added")}</h3>
            <button
              type="button"
              className="hub-pill"
              onClick={() => playTracks(recent.map(playerTrack), 0, t("Recently added"))}
            >
              <Play size={14} /> {t("Play all")} ({recent.length})
            </button>
            {recent.length > 30 && (
              <button type="button" className="hub-pill" onClick={() => setAllRecent((v) => !v)}>
                {allRecent ? t("Show fewer") : t("Show all")}
              </button>
            )}
          </div>
          <SongTable
            songs={allRecent ? recent : recent.slice(0, 30)}
            context={t("Recently added")}
          />
        </section>
      )}
    </div>
  );
}

function playlistSlide(
  p: HubPlaylist,
  t: ReturnType<typeof useT>,
  play: (p: HubPlaylist) => void,
  open: (p: HubPlaylist) => void,
): CoverflowSlide {
  return {
    key: `list:${p.service}:${p.id}`,
    image: p.image,
    title: p.name,
    subtitle: `${SERVICE_LABEL[p.service]} · ${p.count} ${t("tracks")}`,
    play: () => play(p),
    open: () => open(p),
  };
}

/**
 * Cards for a listener with few playlists: their newest liked songs (with artwork) and their
 * playlists, alternating. A song plays the liked songs from there.
 */
function mixedSlides(
  library: HubLibrary | null,
  t: ReturnType<typeof useT>,
  play: (p: HubPlaylist) => void,
  open: (p: HubPlaylist) => void,
): CoverflowSlide[] {
  if (!library) return [];
  const recent = library.recent;
  const songs: CoverflowSlide[] = [];
  recent.forEach((s, i) => {
    if (!s.image || songs.length >= 6) return;
    songs.push({
      key: `song:${s.service}:${s.id}`,
      image: s.image,
      title: s.title,
      subtitle: s.artist,
      play: () => playTracks(recent.map(playerTrack), i, t("Your liked songs")),
    });
  });
  const lists = library.playlists.map((p) => playlistSlide(p, t, play, open));
  const out: CoverflowSlide[] = [];
  for (let i = 0; i < Math.max(songs.length, lists.length); i++) {
    if (songs[i]) out.push(songs[i]);
    if (lists[i]) out.push(lists[i]);
  }
  return out.slice(0, 9);
}

function SongTable({ songs, context }: { songs: HubSong[]; context: string }) {
  const t = useT();
  const player = usePlayer();
  const [menu, setMenu] = useState<string | null>(null);
  const current = player.queue[player.index];
  return (
    <div className="hub-table" role="table" aria-label={context}>
      <div className="hub-row hub-row-head" role="row">
        <span role="columnheader">{t("Track")}</span>
        <span role="columnheader">{t("Artist")}</span>
        <span role="columnheader">{t("Album")}</span>
        <span role="columnheader">{t("Time")}</span>
        <span role="columnheader" className="sr-only">
          {t("More")}
        </span>
      </div>
      {songs.map((s, i) => {
        const playing = !!current && current.title === s.title && current.artist === s.artist;
        return (
          <div
            key={`${s.id}-${i}`}
            className="hub-row"
            role="row"
            data-playing={playing}
            draggable
            title={t("Drag to Play now, the queue, or a DJ Studio deck")}
            onDragStart={(e) => startStudioDrag(e, { kind: "song", song: hubDragSong(s) })}
          >
            <button
              type="button"
              role="cell"
              className="hub-row-song"
              onClick={() => playTracks(songs.map(playerTrack), i, context)}
            >
              {s.image ? (
                <img src={s.image} alt="" loading="lazy" />
              ) : (
                <span className="hub-noart" />
              )}
              <span className="hub-row-title">{s.title}</span>
            </button>
            <span role="cell" className="hub-row-dim">
              {s.artist}
            </span>
            <span role="cell" className="hub-row-dim">
              {s.album || SERVICE_LABEL[s.service]}
            </span>
            <span role="cell" className="hub-row-dim">
              {formatDuration(s.durationSec)}
            </span>
            <span role="cell" className="hub-row-more">
              <button
                type="button"
                className="hub-icon"
                aria-label={`${t("More for")} ${s.title}`}
                aria-expanded={menu === s.id}
                onClick={() => setMenu(menu === s.id ? null : s.id)}
              >
                <MoreHorizontal size={18} />
              </button>
              {menu === s.id && (
                <div className="hub-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      playNext([playerTrack(s)]);
                      setMenu(null);
                    }}
                  >
                    <Play size={14} /> {t("Play next")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      addToQueue([playerTrack(s)]);
                      setMenu(null);
                    }}
                  >
                    <ListPlus size={14} /> {t("Add to queue")}
                  </button>
                </div>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
