import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  AudioWaveform,
  ChevronDown,
  GripVertical,
  ListMusic,
  Maximize2,
  Moon,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  attachPlayer,
  clearUpNext,
  closePlayer,
  cycleRepeat,
  jumpTo,
  moveTrack,
  next,
  previous,
  removeAt,
  seek,
  setCrossfade,
  setPlayerView,
  setSleepTimer,
  setVolume,
  toggleMute,
  togglePlay,
  toggleQueue,
  toggleShuffle,
  usePlayer,
  type PlayerState,
} from "@/lib/music/player/store";
import "./web-player.css";

const time = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

const SOURCE_LABEL: Record<string, string> = {
  youtube: "YouTube",
  spotify: "Spotify",
  file: "Your files",
  jellyfin: "Jellyfin",
  song: "",
};

/**
 * The shared web player: a glass bar at the bottom of every screen while music plays, and a
 * full-screen Now Playing with the video, the controls and the queue. The two video decks live
 * in one stage element that moves between the bar and the full view without reloading.
 */
export function WebPlayer() {
  const t = useT();
  const player = usePlayer();
  const stage = useRef<HTMLDivElement>(null);
  const track = player.queue[player.index] ?? null;
  const full = player.view === "full";

  useEffect(() => {
    if (stage.current) return attachPlayer(stage.current);
  }, []);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlayerView("mini");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const shown = !!track;
  const left = useLeftGutter(shown);
  return (
    <div
      className="wp-root"
      data-view={player.view}
      data-shown={shown ? "true" : "false"}
      style={{ "--wp-left": `${left}px` } as CSSProperties}
    >
      {full && track && (
        <div className="wp-full" role="dialog" aria-label={t("Now playing")}>
          {track.art && <img className="wp-full-glow" src={track.art} alt="" aria-hidden="true" />}
          <button
            type="button"
            className="wp-icon wp-full-close"
            aria-label={t("Close full screen")}
            onClick={() => setPlayerView("mini")}
          >
            <ChevronDown size={26} />
          </button>
          <div className="wp-full-main">
            <div className="wp-full-stage-slot" aria-hidden="true">
              {track.art && <img src={track.art} alt="" />}
            </div>
            <div className="wp-full-info">
              <div className="wp-full-titles">
                <p className="wp-eyebrow">
                  {[SOURCE_LABEL[track.source], player.context].filter(Boolean).join(" · ")}
                </p>
                <h2>{track.title}</h2>
                <p className="wp-artist">{track.artist}</p>
              </div>
              <Meta track={track} />
            </div>
            <Progress player={player} large />
            <div className="wp-full-controls">
              <Transport player={player} large />
              <Extras player={player} />
            </div>
          </div>
          <QueuePanel player={player} docked />
        </div>
      )}

      <div
        ref={stage}
        className="wp-stage"
        onClick={() => !full && setPlayerView("full")}
        aria-hidden="true"
      />

      {shown && !full && (
        <div className="wp-bar" role="region" aria-label={t("Music player")}>
          <button
            type="button"
            className="wp-bar-art"
            aria-label={t("Open Now Playing")}
            onClick={() => setPlayerView("full")}
          >
            {track.art ? <img src={track.art} alt="" /> : <ListMusic size={22} />}
          </button>
          <div className="wp-bar-titles">
            <span className="wp-bar-title">{track.title}</span>
            <span className="wp-bar-artist">
              {track.artist}
              {player.loading ? ` · ${t("Loading…")}` : ""}
            </span>
          </div>
          <div className="wp-bar-center">
            <Transport player={player} />
            <Progress player={player} />
          </div>
          <div className="wp-bar-right">
            <Volume player={player} />
            <button
              type="button"
              className="wp-icon"
              data-on={player.queueOpen}
              aria-label={t("Queue")}
              aria-pressed={player.queueOpen}
              onClick={() => toggleQueue()}
            >
              <ListMusic size={20} />
            </button>
            <button
              type="button"
              className="wp-icon"
              aria-label={t("Full screen")}
              onClick={() => setPlayerView("full")}
            >
              <Maximize2 size={18} />
            </button>
            <button
              type="button"
              className="wp-icon"
              aria-label={t("Stop and close the player")}
              onClick={closePlayer}
            >
              <X size={18} />
            </button>
          </div>
          {player.error && <p className="wp-bar-error">{player.error}</p>}
        </div>
      )}
      {shown && !full && player.queueOpen && <QueuePanel player={player} />}
    </div>
  );
}

/**
 * The width of a side menu along the left edge (the desktop layout's sidebar), so the bar
 * centres in the space beside it instead of covering it.
 */
function useLeftGutter(active: boolean): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!active) return;
    const measure = () => {
      let edge = 0;
      for (const el of document.elementsFromPoint(24, window.innerHeight - 60)) {
        if (el.closest(".wp-root")) continue;
        const r = el.getBoundingClientRect();
        if (
          r.left <= 24 &&
          r.width < window.innerWidth * 0.4 &&
          r.height > window.innerHeight * 0.6
        )
          edge = Math.max(edge, r.right);
      }
      setLeft(Math.round(edge));
    };
    measure();
    const id = window.setInterval(measure, 2000);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [active]);
  return left;
}

function Meta({ track }: { track: NonNullable<PlayerState["queue"][number]> }) {
  const t = useT();
  if (!track.bpm && !track.camelot) return null;
  return (
    <dl className="wp-meta">
      {track.bpm ? (
        <div>
          <dt>{t("BPM")}</dt>
          <dd>{Math.round(track.bpm)}</dd>
        </div>
      ) : null}
      {track.camelot ? (
        <div>
          <dt>{t("Key")}</dt>
          <dd>{track.camelot}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function Transport({ player, large = false }: { player: PlayerState; large?: boolean }) {
  const t = useT();
  const size = large ? 26 : 18;
  return (
    <div className="wp-transport" data-large={large}>
      <button
        type="button"
        className="wp-icon"
        data-on={player.shuffle}
        aria-pressed={player.shuffle}
        aria-label={t("Shuffle")}
        onClick={toggleShuffle}
      >
        <Shuffle size={size - 2} />
      </button>
      <button type="button" className="wp-icon" aria-label={t("Previous")} onClick={previous}>
        <SkipBack size={size} />
      </button>
      <button
        type="button"
        className="wp-play"
        aria-label={player.playing ? t("Pause") : t("Play")}
        onClick={togglePlay}
      >
        {player.playing ? <Pause size={size + 2} /> : <Play size={size + 2} />}
      </button>
      <button type="button" className="wp-icon" aria-label={t("Next")} onClick={next}>
        <SkipForward size={size} />
      </button>
      <button
        type="button"
        className="wp-icon"
        data-on={player.repeat !== "off"}
        aria-label={
          player.repeat === "one"
            ? t("Repeat this song")
            : player.repeat === "all"
              ? t("Repeat all")
              : t("Repeat off")
        }
        onClick={cycleRepeat}
      >
        {player.repeat === "one" ? <Repeat1 size={size - 2} /> : <Repeat size={size - 2} />}
      </button>
    </div>
  );
}

function Progress({ player, large = false }: { player: PlayerState; large?: boolean }) {
  const t = useT();
  const [drag, setDrag] = useState<number | null>(null);
  const value = drag ?? player.position;
  const max = Math.max(1, player.duration);
  return (
    <div className="wp-progress" data-large={large}>
      <span>{time(value)}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={Math.min(value, max)}
        aria-label={t("Seek")}
        style={{ "--fill": `${(Math.min(value, max) / max) * 100}%` } as CSSProperties}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => {
          if (drag !== null) seek(drag);
          setDrag(null);
        }}
        onKeyUp={() => {
          if (drag !== null) seek(drag);
          setDrag(null);
        }}
      />
      <span>{player.duration ? `-${time(player.duration - value)}` : "--:--"}</span>
    </div>
  );
}

function Volume({ player }: { player: PlayerState }) {
  const t = useT();
  const v = player.muted ? 0 : player.volume;
  return (
    <div className="wp-volume">
      <button
        type="button"
        className="wp-icon"
        aria-label={player.muted ? t("Unmute") : t("Mute")}
        onClick={toggleMute}
      >
        {v === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={v}
        aria-label={t("Volume")}
        style={{ "--fill": `${v}%` } as CSSProperties}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
    </div>
  );
}

const SLEEP_CHOICES: { label: string; value: number | "song" | null }[] = [
  { label: "Off", value: null },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hour", value: 60 },
  { label: "End of song", value: "song" },
];

function Extras({ player }: { player: PlayerState }) {
  const t = useT();
  const [menu, setMenu] = useState<"sleep" | "fade" | null>(null);
  const sleeping = player.sleepAt !== null || player.sleepAfterSong;
  const left = player.sleepAt ? Math.max(0, Math.ceil((player.sleepAt - Date.now()) / 60_000)) : 0;
  return (
    <div className="wp-extras">
      <Volume player={player} />
      <div className="wp-menu-wrap">
        <button
          type="button"
          className="wp-chip"
          data-on={player.crossfade > 0}
          aria-expanded={menu === "fade"}
          onClick={() => setMenu(menu === "fade" ? null : "fade")}
        >
          <AudioWaveform size={16} />
          {player.crossfade > 0 ? `${t("Crossfade")} ${player.crossfade}s` : t("No crossfade")}
        </button>
        {menu === "fade" && (
          <div className="wp-menu" role="group" aria-label={t("Crossfade")}>
            <label className="wp-menu-range">
              <span>
                {t("Crossfade")}: {player.crossfade}s
              </span>
              <input
                type="range"
                min={0}
                max={12}
                value={player.crossfade}
                style={{ "--fill": `${(player.crossfade / 12) * 100}%` } as CSSProperties}
                onChange={(e) => setCrossfade(Number(e.target.value))}
              />
            </label>
          </div>
        )}
      </div>
      <div className="wp-menu-wrap">
        <button
          type="button"
          className="wp-chip"
          data-on={sleeping}
          aria-expanded={menu === "sleep"}
          onClick={() => setMenu(menu === "sleep" ? null : "sleep")}
        >
          <Moon size={16} />
          {player.sleepAfterSong
            ? t("Stops after this song")
            : player.sleepAt
              ? `${t("Sleep in")} ${left} min`
              : t("Sleep timer")}
        </button>
        {menu === "sleep" && (
          <div className="wp-menu" role="menu" aria-label={t("Sleep timer")}>
            {SLEEP_CHOICES.map((c) => (
              <button
                key={c.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setSleepTimer(c.value);
                  setMenu(null);
                }}
              >
                {t(c.label)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QueuePanel({ player, docked = false }: { player: PlayerState; docked?: boolean }) {
  const t = useT();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const upNext = player.queue.length - player.index - 1;
  const drop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragFrom !== null) moveTrack(dragFrom, to);
    setDragFrom(null);
  };
  return (
    <aside className="wp-queue" data-docked={docked} aria-label={t("Queue")}>
      <header>
        <div>
          <h3>{t("Up next")}</h3>
          <span>
            {upNext > 0 ? `${upNext} ${upNext === 1 ? t("song") : t("songs")}` : t("Nothing next")}
            {player.context ? ` · ${player.context}` : ""}
          </span>
        </div>
        <div className="wp-queue-actions">
          {upNext > 0 && (
            <button type="button" className="wp-chip" onClick={clearUpNext}>
              {t("Clear")}
            </button>
          )}
          {!docked && (
            <button
              type="button"
              className="wp-icon"
              aria-label={t("Close queue")}
              onClick={() => toggleQueue(false)}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </header>
      <ol>
        {player.queue.map((item, i) => (
          <li
            key={item.key}
            data-current={i === player.index}
            data-played={i < player.index}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(e, i)}
          >
            <GripVertical size={16} className="wp-grip" aria-hidden="true" />
            <button type="button" className="wp-queue-song" onClick={() => jumpTo(i)}>
              {item.art ? <img src={item.art} alt="" /> : <span className="wp-queue-noart" />}
              <span className="wp-queue-text">
                <span className="wp-queue-title">{item.title}</span>
                <span className="wp-queue-artist">
                  {item.artist}
                  {SOURCE_LABEL[item.source] ? ` · ${SOURCE_LABEL[item.source]}` : ""}
                </span>
              </span>
              {item.bpm ? <span className="wp-queue-bpm">{Math.round(item.bpm)} BPM</span> : null}
            </button>
            <button
              type="button"
              className="wp-icon"
              aria-label={`${t("Remove")} ${item.title}`}
              onClick={() => removeAt(i)}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
