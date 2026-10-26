import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Heart,
  ListPlus,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Radio,
  Send,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  Waves,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useJlSession } from "@/lib/jl/account/client";
import {
  djState,
  goTo,
  isLiked,
  playNext,
  requestDj,
  startDj,
  stopDj,
  toggleLike,
  useDj,
  videoFailed,
} from "@/lib/music/dj/session";
import { VIBES, crossfade, type DjSong, type Vibe } from "@/lib/music/dj/vibes";
import {
  YT_ENDED,
  YT_PLAYING,
  loadYouTube,
  youtubeFrame,
  type YtPlayer,
} from "@/lib/music/dj/youtube";
import { coverArt } from "@/lib/music/cover-art";
import { videoAspects } from "@/lib/music/dj/api";
import { useSongArt } from "@/lib/music/dj/art";
import { onPauseDj, reportPlayhead } from "@/lib/music/dj/playhead";
import { soundById } from "@/lib/music/sounds/catalog";
import { loadMix } from "@/lib/music/sounds/engine";
import { useSettings } from "@/lib/settings";
import { DjVinyl } from "./music-dj-vinyl";
import type { SongToShare } from "@/lib/music/social/api";
import { SendSongDialog } from "./music-send";
import "./music-dj.css";

const FADE_MS = 8000;

/** A cover that fails to load hides, leaving the poster's own art behind it. */
const hideBroken = (e: { currentTarget: HTMLImageElement }) => {
  e.currentTarget.style.visibility = "hidden";
};
const TICK_MS = 200;
const QUICK_REQUESTS = [
  "More like this",
  "Switch it up",
  "Go older",
  "Newer songs",
  "Slow it down",
  "Turn it up",
  "Surprise me with new artists",
];

/**
 * The AI DJ: pick or describe a vibe, and the DJ plays a set of music videos on two decks,
 * crossfading from one song into the next. Take requests, keep songs you like, and find new
 * artists. Stays mounted while the Music Hub is open so the set keeps playing between tabs.
 */
export function MusicDj({ visible }: { visible: boolean }) {
  const t = useT();
  const session = useJlSession();
  const { settings } = useSettings();
  const styles = settings.musicStyles ?? [];
  const dj = useDj();
  const [typed, setTyped] = useState("");
  const [request, setRequest] = useState("");
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(90);
  const [opacity, setOpacity] = useState<[number, number]>([1, 0]);
  const [sending, setSending] = useState<SongToShare | null>(null);

  const hosts = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const players = useRef<(YtPlayer | null)[]>([null, null]);
  const loaded = useRef<(string | null)[]>([null, null]);
  const active = useRef(0);
  const fade = useRef<{ start: number; to: number; nextIndex: number } | null>(null);
  const live = useRef({ index: dj.index, volume, paused });
  live.current = { index: dj.index, volume, paused };

  const current = dj.tracks[dj.index];
  const next = dj.tracks[dj.index + 1];
  const currentId = current?.video?.id ?? null;
  const nextIdRef = useRef<string | null>(null);
  nextIdRef.current = next?.video?.id ?? null;

  // Which video each deck shows, and every video's shape: a deck zooms just enough to cover the
  // stage, so 4:3 and other non-widescreen videos fill it with no black bars.
  const [deckIds, setDeckIds] = useState<[string | null, string | null]>([null, null]);
  const showDeck = (deck: number, id: string | null) =>
    setDeckIds((ids) => (deck === 0 ? [id, ids[1]] : [ids[0], id]));
  const [aspects, setAspects] = useState<Map<string, number>>(new Map());
  const upcoming = dj.tracks
    .slice(dj.index, dj.index + 3)
    .map((tr) => tr.video?.id)
    .filter((id): id is string => !!id)
    .join(",");
  useEffect(() => {
    if (!upcoming) return;
    let live = true;
    void videoAspects(upcoming.split(",")).then((map) => live && setAspects(new Map(map)));
    return () => {
      live = false;
    };
  }, [upcoming]);
  const [stageAspect, setStageAspect] = useState(16 / 9);
  const deckZoom = (id: string | null) => {
    const ratio = id ? aspects.get(id) : undefined;
    if (!ratio) return 1;
    return Math.min(2.4, Math.max(ratio / stageAspect, stageAspect / ratio));
  };

  // Posters, the wallpaper and the record label all use the song's cover art.
  const artFor = useSongArt([...dj.tracks, ...dj.discover, ...dj.liked.slice(0, 24)]);
  // While the lookup runs, the video thumbnail; once no catalog has a cover, original art.
  const cover = (song: DjSong & { video?: { thumb: string } | null }) => {
    const meta = artFor(song);
    if (meta?.art) return meta.art;
    if (song.video?.thumb) return song.video.thumb;
    return meta ? coverArt(song.title, song.artist) : null;
  };

  // While a song plays the controls fade so the video shows; any mouse move brings them back.
  const stageRef = useRef<HTMLDivElement>(null);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(0);
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 3200);
  }, []);
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);
  // A new song (or the first) shows the controls for a moment, then they fade on their own.
  const songKeyNow = current ? `${current.artist} - ${current.title}` : "";
  useEffect(() => {
    if (started && songKeyNow) wake();
  }, [started, songKeyNow, wake]);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const resize = new ResizeObserver(() => {
      if (el.clientHeight > 0) setStageAspect(el.clientWidth / el.clientHeight);
    });
    resize.observe(el);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.().catch(() => {});
  };

  /** Build both decks once, on the first Play (browsers need a tap before sound). */
  const ensureDecks = useCallback(async () => {
    if (players.current[0] && players.current[1]) return;
    const api = await loadYouTube();
    await Promise.all(
      [0, 1].map(
        (deck) =>
          new Promise<void>((resolve) => {
            const host = hosts[deck].current;
            if (!host || players.current[deck]) return resolve();
            const frame = youtubeFrame(host, {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              playsinline: 1,
              rel: 0,
              iv_load_policy: 3,
            });
            players.current[deck] = new api.Player(frame, {
              events: {
                onReady: () => resolve(),
                onStateChange: ({ data }: { data: number }) => {
                  if (data === YT_ENDED && deck === active.current && !fade.current)
                    goTo(live.current.index + 1, styles);
                },
                onError: () => {
                  if (deck === active.current && !fade.current) videoFailed(live.current.index);
                },
              },
            });
          }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the song on into the active deck (a start, a skip, or a retry with another upload).
  useEffect(() => {
    if (!started || fade.current) return;
    const deck = active.current;
    const player = players.current[deck];
    if (!player || !currentId || loaded.current[deck] === currentId) return;
    loaded.current[deck] = currentId;
    showDeck(deck, currentId);
    player.setVolume(live.current.volume);
    player.loadVideoById(currentId);
    if (live.current.paused) player.pauseVideo();
    players.current[1 - deck]?.stopVideo();
    loaded.current[1 - deck] = null;
    setOpacity(deck === 0 ? [1, 0] : [0, 1]);
  }, [started, currentId, dj.index]);

  // The mixer: near the end of a song, start the next on the other deck and crossfade.
  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => {
      const from = active.current;
      const a = players.current[from];
      const b = players.current[1 - from];
      const on = djState().tracks[live.current.index];
      reportPlayhead(
        a && on?.video && loaded.current[from] === on.video.id
          ? {
              videoId: on.video.id,
              artist: on.artist,
              title: on.title,
              position: a.getCurrentTime(),
              paused: live.current.paused,
              at: Date.now(),
            }
          : null,
      );
      if (!a || !b || live.current.paused) return;
      const f = fade.current;
      if (f) {
        const [out, inn] = crossfade((Date.now() - f.start) / FADE_MS);
        a.setVolume(out * live.current.volume);
        b.setVolume(inn * live.current.volume);
        setOpacity(from === 0 ? [out, inn] : [inn, out]);
        if (Date.now() - f.start >= FADE_MS) {
          a.stopVideo();
          loaded.current[from] = null;
          active.current = f.to;
          fade.current = null;
          goTo(f.nextIndex, styles);
        }
        return;
      }
      const upNext = live.current.index + 1;
      const nextId = nextIdRef.current;
      const duration = a.getDuration();
      const left = duration - a.getCurrentTime();
      if (
        nextId &&
        duration > 30 &&
        left > 0 &&
        left * 1000 <= FADE_MS &&
        a.getPlayerState() === YT_PLAYING
      ) {
        loaded.current[1 - from] = nextId;
        showDeck(1 - from, nextId);
        b.setVolume(0);
        b.loadVideoById(nextId);
        fade.current = { start: Date.now(), to: 1 - from, nextIndex: upNext };
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      reportPlayhead(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Leaving the Music Hub stops the decks.
  useEffect(
    () => () => {
      for (const p of players.current) p?.destroy();
      players.current = [null, null];
    },
    [],
  );

  /** A set started elsewhere (a song a friend sent) waits for a tap to start the decks. */
  const resume = async () => {
    fade.current = null;
    loaded.current = [null, null];
    setPaused(false);
    await ensureDecks().catch(() => {});
    setStarted(true);
  };

  const begin = async (vibe: Vibe) => {
    fade.current = null;
    loaded.current = [null, null];
    setPaused(false);
    await ensureDecks().catch(() => {});
    setStarted(true);
    void startDj(vibe, styles);
  };

  const cut = (index: number) => {
    fade.current = null;
    goTo(index, styles);
  };

  const togglePause = () => {
    const p = players.current[active.current];
    if (!p) return;
    if (paused) p.playVideo();
    else {
      p.pauseVideo();
      if (fade.current) {
        players.current[1 - active.current]?.pauseVideo();
      }
    }
    setPaused(!paused);
  };

  // Joining a friend's lounge quiets the decks so only the lounge plays.
  const pauseRef = useRef(togglePause);
  pauseRef.current = togglePause;
  useEffect(
    () =>
      onPauseDj(() => {
        if (!live.current.paused) pauseRef.current();
      }),
    [],
  );

  const changeVolume = (v: number) => {
    setVolume(v);
    if (!fade.current) players.current[active.current]?.setVolume(v);
  };

  const ambience = dj.sounds.filter((id) => {
    const kind = soundById(id)?.kind;
    return kind === "noise" || kind === "nature";
  });

  const stage = {
    "--dj-a": dj.colors?.[0] ?? "#6366f1",
    "--dj-b": dj.colors?.[1] ?? "#0f172a",
  } as CSSProperties;

  if (!session) {
    return visible ? (
      <section className="music-dj-signin">
        <Radio size={30} />
        <h2>{t("AI DJ & Vibes")}</h2>
        <p>{t("Sign in to your JL Media Vision account to start the AI DJ.")}</p>
      </section>
    ) : null;
  }

  return (
    <section className="music-dj" hidden={!visible} style={stage}>
      <div
        ref={stageRef}
        className="music-dj-stage"
        data-on={started && !!dj.vibe}
        data-idle={started && !!current && idle}
        data-full={full}
        onMouseMove={wake}
        onMouseLeave={() => setIdle(true)}
        onTouchStart={wake}
        onFocusCapture={wake}
      >
        {current && cover(current) && (
          <div
            className="music-dj-wallpaper"
            aria-hidden="true"
            style={{ backgroundImage: `url("${cover(current)}")` }}
          />
        )}
        <div className="music-dj-decks" aria-hidden={!started}>
          <div
            ref={hosts[0]}
            className="music-dj-deck"
            style={{ opacity: opacity[0], transform: `scale(${deckZoom(deckIds[0])})` }}
          />
          <div
            ref={hosts[1]}
            className="music-dj-deck"
            style={{ opacity: opacity[1], transform: `scale(${deckZoom(deckIds[1])})` }}
          />
        </div>
        <div className="music-dj-glow" />
        {started && dj.vibe && (
          <button
            type="button"
            className="music-dj-full"
            aria-label={full ? t("Exit full screen") : t("Full screen")}
            onClick={toggleFull}
          >
            {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        )}
        <div className="music-dj-overlay">
          {dj.vibe ? (
            <>
              <p className="music-dj-vibe">
                <Sparkles size={14} /> {t(dj.vibe.name)}
              </p>
              {dj.status === "thinking" && !current && (
                <p className="music-dj-intro">{t("Your DJ is building the set…")}</p>
              )}
              {dj.intro && <p className="music-dj-intro">“{dj.intro}”</p>}
              {current && (
                <DjVinyl
                  track={current}
                  index={dj.index}
                  playing={started && !paused}
                  why={current.why}
                  coverOf={cover}
                />
              )}
              {!started && current && (
                <button type="button" className="music-dj-start" onClick={() => void resume()}>
                  <Play size={18} /> {t("Start listening")}
                </button>
              )}
              <div className="music-dj-controls">
                <button
                  type="button"
                  aria-label={t("Previous")}
                  disabled={dj.index === 0}
                  onClick={() => cut(dj.index - 1)}
                >
                  <SkipBack size={18} />
                </button>
                <button
                  type="button"
                  className="music-dj-play"
                  aria-label={paused ? t("Play") : t("Pause")}
                  onClick={togglePause}
                >
                  {paused ? <Play size={20} /> : <Pause size={20} />}
                </button>
                <button
                  type="button"
                  aria-label={t("Next")}
                  disabled={dj.index >= dj.tracks.length - 1}
                  onClick={() => cut(dj.index + 1)}
                >
                  <SkipForward size={18} />
                </button>
                {current && (
                  <button
                    type="button"
                    aria-pressed={isLiked(current)}
                    aria-label={t("Keep this song")}
                    onClick={() => toggleLike(current)}
                  >
                    <Heart size={18} fill={isLiked(current) ? "currentColor" : "none"} />
                  </button>
                )}
                {current && (
                  <button
                    type="button"
                    aria-label={t("Send to a friend")}
                    onClick={() =>
                      setSending({
                        artist: current.artist,
                        title: current.title,
                        videoId: current.video?.id,
                      })
                    }
                  >
                    <Send size={18} />
                  </button>
                )}
                <label className="music-dj-volume">
                  <Volume2 size={16} />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    aria-label={t("Volume")}
                    onChange={(e) => changeVolume(Number(e.target.value))}
                  />
                </label>
                {ambience.length > 0 && (
                  <button
                    type="button"
                    className="music-dj-ambience"
                    onClick={() =>
                      loadMix({
                        name: dj.vibe?.name ?? "Vibe",
                        beatMode: "binaural",
                        layers: ambience.map((id) => ({ id, volume: 0.22 })),
                      })
                    }
                  >
                    <Waves size={15} /> {t("Add ambience")}
                  </button>
                )}
                <button
                  type="button"
                  className="music-dj-end"
                  onClick={() => {
                    for (const p of players.current) p?.stopVideo();
                    loaded.current = [null, null];
                    setStarted(false);
                    stopDj();
                  }}
                >
                  {t("End set")}
                </button>
              </div>
            </>
          ) : (
            <div className="music-dj-hello">
              <Radio size={28} />
              <h2>{t("AI DJ & Vibes")}</h2>
              <p>
                {t(
                  "Pick a vibe or describe one. Your DJ builds a set of music videos and mixes one song into the next.",
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {dj.error && <p className="music-dj-error">{dj.error}</p>}

      <form
        className="music-dj-ask"
        onSubmit={(e) => {
          e.preventDefault();
          const words = typed.trim();
          if (!words) return;
          setTyped("");
          void begin({ id: "custom", name: words, prompt: words, colors: ["#8b5cf6", "#0f172a"] });
        }}
      >
        <Sparkles size={16} />
        <input
          value={typed}
          maxLength={200}
          placeholder={t("Describe your vibe: “smooth jazz on a Hawaii beach”")}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button type="submit" disabled={!typed.trim()}>
          {t("Start the DJ")}
        </button>
      </form>

      <div className="music-dj-vibes" role="list" aria-label={t("Vibes")}>
        {VIBES.map((v) => (
          <button
            key={v.id}
            type="button"
            role="listitem"
            aria-pressed={dj.vibe?.id === v.id}
            aria-label={t(v.name)}
            style={
              {
                "--v-a": v.colors[0],
                "--v-b": v.colors[1],
                backgroundImage: `url("${coverArt(t(v.name), t("AI DJ vibe"), v.colors)}")`,
              } as CSSProperties
            }
            onClick={() => void begin(v)}
          />
        ))}
      </div>

      {dj.vibe && (
        <form
          className="music-dj-request"
          onSubmit={(e) => {
            e.preventDefault();
            const words = request.trim();
            if (!words) return;
            setRequest("");
            void requestDj(words, styles);
          }}
        >
          <input
            value={request}
            maxLength={200}
            placeholder={t("Ask the DJ: “more 90s”, “add some Bob Marley”…")}
            onChange={(e) => setRequest(e.target.value)}
          />
          <button
            type="submit"
            aria-label={t("Send request")}
            disabled={!request.trim() || dj.status === "thinking"}
          >
            <Send size={16} />
          </button>
          <div className="music-dj-quick">
            {QUICK_REQUESTS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={dj.status === "thinking"}
                onClick={() => void requestDj(q, styles)}
              >
                {t(q)}
              </button>
            ))}
          </div>
        </form>
      )}

      {dj.tracks.length > 0 && (
        <section className="music-dj-list">
          <h3>{t("The set")}</h3>
          <ol className="music-dj-posters">
            {dj.tracks.map((tr, i) => {
              const art = cover(tr);
              const meta = artFor(tr);
              return (
                <li
                  key={`${tr.artist}-${tr.title}`}
                  data-current={i === dj.index}
                  data-played={i < dj.index}
                >
                  <button
                    type="button"
                    className="music-dj-poster"
                    onClick={() => cut(i)}
                    disabled={tr.video === null}
                  >
                    <span className="music-dj-poster-blank" />
                    {art && (
                      <>
                        <img className="music-dj-poster-bg" src={art} alt="" loading="lazy" />
                        <img
                          className="music-dj-poster-art"
                          src={art}
                          alt=""
                          loading="lazy"
                          onError={hideBroken}
                        />
                      </>
                    )}
                    <span className="music-dj-poster-no">{String(i + 1).padStart(2, "0")}</span>
                    {i === dj.index && (
                      <span className="music-dj-eq" aria-label={t("Playing")}>
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                    <span className="music-dj-poster-text">
                      <strong>{tr.title}</strong>
                      <span>{tr.artist}</span>
                      {(meta?.year || meta?.album) && (
                        <em>{[meta.album, meta.year].filter(Boolean).join(" · ")}</em>
                      )}
                      {tr.video === null && <em>{t("Not found on YouTube")}</em>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {dj.discover.length > 0 && (
        <section className="music-dj-list">
          <h3>{t("New artists for you")}</h3>
          <div className="music-dj-new">
            {dj.discover.map((d) => {
              const art = cover(d);
              return (
                <article key={`${d.artist}-${d.title}`}>
                  {art && (
                    <span
                      className="music-dj-new-bg"
                      aria-hidden="true"
                      style={{ backgroundImage: `url("${art}")` }}
                    />
                  )}
                  <span className="music-dj-new-cover">
                    <span className="music-dj-poster-blank" />
                    {art && (
                      <>
                        <img className="music-dj-poster-bg" src={art} alt="" loading="lazy" />
                        <img
                          className="music-dj-poster-art"
                          src={art}
                          alt=""
                          loading="lazy"
                          onError={hideBroken}
                        />
                      </>
                    )}
                  </span>
                  <div className="music-dj-new-body">
                    <span className="music-dj-new-tag">
                      <Sparkles size={12} /> {t("New artist")}
                    </span>
                    <h4>{d.artist}</h4>
                    <p className="music-dj-new-song">
                      {t("Start with “{title}”", { title: d.title })}
                    </p>
                    {d.why && <p className="music-dj-new-why">{d.why}</p>}
                    <div className="music-dj-new-actions">
                      <button type="button" className="music-dj-new-go" onClick={() => playNext(d)}>
                        <ListPlus size={15} /> {t("Play next")}
                      </button>
                      <button
                        type="button"
                        aria-pressed={isLiked(d)}
                        aria-label={isLiked(d) ? t("Kept") : t("Keep")}
                        onClick={() => toggleLike(d)}
                      >
                        <Heart size={15} fill={isLiked(d) ? "currentColor" : "none"} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("Send to a friend")}
                        onClick={() => setSending({ artist: d.artist, title: d.title })}
                      >
                        <Send size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {dj.liked.length > 0 && (
        <section className="music-dj-list">
          <h3>{t("My DJ finds")}</h3>
          <ol className="music-dj-posters music-dj-posters-small">
            {dj.liked.slice(0, 24).map((sg) => {
              const art = cover(sg);
              return (
                <li key={`${sg.artist}-${sg.title}`}>
                  <button
                    type="button"
                    className="music-dj-poster"
                    disabled={!dj.vibe}
                    title={dj.vibe ? t("Play next") : undefined}
                    onClick={() => playNext(sg)}
                  >
                    <span className="music-dj-poster-blank" />
                    {art && (
                      <>
                        <img className="music-dj-poster-bg" src={art} alt="" loading="lazy" />
                        <img
                          className="music-dj-poster-art"
                          src={art}
                          alt=""
                          loading="lazy"
                          onError={hideBroken}
                        />
                      </>
                    )}
                    <span className="music-dj-poster-text">
                      <strong>{sg.title}</strong>
                      <span>{sg.artist}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {sending && <SendSongDialog song={sending} onClose={() => setSending(null)} />}
    </section>
  );
}
