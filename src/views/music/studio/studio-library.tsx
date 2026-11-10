import { useRef, useState, type DragEvent } from "react";
import type { StudioDeck } from "@/lib/music/studio/deck";
import {
  addFiles,
  dequeue,
  enqueue,
  moveInQueue,
  useCrate,
  type CrateItem,
} from "@/lib/music/studio/library";
import { useT } from "@/lib/i18n";
import { formatTime } from "./studio-controls";
import { DECK_NAMES } from "./studio-deck";
import type { AutoSong } from "@/lib/music/automix/playlists";
import { JellyfinSource } from "./studio-sources";
import { PlaylistSource } from "./studio-playlists";
import { isStudioDrag, readStudioDrag, startStudioDrag } from "@/lib/music/studio/drag";
import { trackFromDrag } from "@/lib/music/song-drag";
import { addToQueue } from "@/lib/music/player/store";
import { youtubeSongFor } from "@/lib/music/studio/mix-song";
import { youtubeAudio, youtubeOnAudioDecks } from "@/lib/music/studio/youtube-audio";

type Source = "all" | "history" | "playlists" | "jellyfin";

/**
 * The library: sources on the left, the track table in the middle (cover, title, artist, BPM,
 * key, time) and the queue on the right. Add files or a folder, or drop them on the screen.
 */
export function StudioLibrary({
  decks,
  onLoad,
  busyDeck,
  artOf,
  onSong,
}: {
  decks: StudioDeck[];
  onLoad: (deck: StudioDeck, id: string) => void;
  busyDeck: number | null;
  artOf: (item: CrateItem) => string;
  /** A song from your playlists for a deck (see PlaylistSource). */
  onSong: (deck: number, song: AutoSong) => void;
}) {
  const t = useT();
  const crate = useCrate();
  const [source, setSource] = useState<Source>("playlists");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [queueOver, setQueueOver] = useState(false);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [queueFrom, setQueueFrom] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  // A queued song slides out before it goes.
  const unqueue = (id: string) => {
    setLeaving(id);
    window.setTimeout(() => {
      dequeue(id);
      setLeaving(null);
    }, 180);
  };
  // A song dropped on the queue: crate songs line up as they are; a playlist song is fetched as
  // music in the desktop app, and on the website (where it can't go on these decks) it joins
  // the player's queue instead.
  const dropOnQueue = async (e: DragEvent) => {
    if (!isStudioDrag(e)) return;
    e.preventDefault();
    setQueueOver(false);
    setQueueNote(null);
    const drag = readStudioDrag(e);
    if (!drag) return;
    try {
      if (drag.kind === "crate") {
        if (queueFrom !== null) moveInQueue(queueFrom, crate.queue.length - 1);
        else enqueue(drag.id);
      } else if (drag.kind === "song" && youtubeOnAudioDecks()) {
        setQueueNote(t("Getting “{title}”…", { title: drag.song.title }));
        enqueue(await youtubeAudio(await youtubeSongFor(drag.song)));
        setQueueNote(null);
      } else {
        const track = trackFromDrag(drag);
        if (track) {
          addToQueue([track]);
          setQueueNote(t("Added to the player's queue."));
        }
      }
    } catch (err) {
      setQueueNote(err instanceof Error ? err.message : String(err));
    }
  };
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const byId = new Map(crate.crate.map((c) => [c.id, c]));
  const base =
    source === "all"
      ? crate.crate
      : crate.history.map((id) => byId.get(id)).filter((c): c is CrateItem => !!c);
  const q = query.trim().toLowerCase();
  const list = base.filter((c) => !q || `${c.artist} ${c.title}`.toLowerCase().includes(q));
  const queue = crate.queue.map((id) => byId.get(id)).filter((c): c is CrateItem => !!c);
  const queueTime = queue.reduce((sum, c) => sum + (c.duration ?? 0), 0);

  const loadButtons = (item: CrateItem) =>
    decks.map((deck) => (
      <button
        key={deck.index}
        type="button"
        className="studio-btn studio-mini"
        data-deck={deck.index}
        disabled={busyDeck === deck.index || crate.loading[item.id]}
        onClick={(e) => {
          e.stopPropagation();
          onLoad(deck, item.id);
        }}
        title={t("Load on deck {name}", { name: DECK_NAMES[deck.index] })}
      >
        {DECK_NAMES[deck.index]}
      </button>
    ));

  return (
    <section className="sl" aria-label={t("Library")}>
      <nav className="sl-sources" aria-label={t("Sources")}>
        <button
          type="button"
          className={`sl-source${source === "all" ? " is-on" : ""}`}
          onClick={() => setSource("all")}
        >
          ♪ {t("My music")} <span>{crate.crate.length}</span>
        </button>
        <button
          type="button"
          className={`sl-source${source === "history" ? " is-on" : ""}`}
          onClick={() => setSource("history")}
        >
          ⟲ {t("History")} <span>{crate.history.length}</span>
        </button>
        <button
          type="button"
          className={`sl-source${source === "playlists" ? " is-on" : ""}`}
          onClick={() => setSource("playlists")}
        >
          ▶ {t("Your playlists")}
        </button>
        <button
          type="button"
          className={`sl-source${source === "jellyfin" ? " is-on" : ""}`}
          onClick={() => setSource("jellyfin")}
        >
          ◈ {t("Jellyfin")}
        </button>
        <div className="sl-add">
          <button type="button" className="studio-btn" onClick={() => files.current?.click()}>
            {t("Add music files")}
          </button>
          <button type="button" className="studio-btn" onClick={() => folder.current?.click()}>
            {t("Add a folder")}
          </button>
        </div>
        <input
          ref={files}
          type="file"
          accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus,.aif,.aiff"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={(el) => {
            folder.current = el;
            // Folder picking is a non-standard attribute React does not type.
            el?.setAttribute("webkitdirectory", "");
          }}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </nav>
      <div className="sl-main">
        {source === "playlists" ? (
          <PlaylistSource deckCount={decks.length} busyDeck={busyDeck} onSong={onSong} />
        ) : source === "jellyfin" ? (
          <JellyfinSource decks={decks} onLoad={onLoad} busyDeck={busyDeck} />
        ) : (
          <>
            <div className="sl-bar">
              <strong>{source === "all" ? t("My music") : t("History")}</strong>
              <span className="sl-count">{t("{n} songs", { n: list.length })}</span>
              <input
                className="studio-search"
                type="search"
                placeholder={t("Search your music")}
                aria-label={t("Search the library")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {list.length === 0 ? (
              <p className="studio-empty">
                {source === "all"
                  ? t(
                      "Add your MP3, FLAC, WAV or M4A files, or drop them anywhere on this screen. They stay on this computer.",
                    )
                  : t("Tracks you load on a deck show up here.")}
              </p>
            ) : (
              <div className="sl-table" role="table" aria-label={t("Tracks")}>
                <div className="sl-tr sl-th" role="row">
                  <span role="columnheader" />
                  <span role="columnheader">{t("Title")}</span>
                  <span role="columnheader">{t("Artist")}</span>
                  <span role="columnheader">BPM</span>
                  <span role="columnheader">{t("Key")}</span>
                  <span role="columnheader">{t("Time")}</span>
                  <span role="columnheader" />
                </div>
                {list.map((item) => (
                  <div
                    key={item.id}
                    role="row"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => startStudioDrag(e, { kind: "crate", id: item.id })}
                    title={t("Drag onto a deck, or use its deck buttons")}
                    className={`sl-tr${selected === item.id ? " is-selected" : ""}`}
                    onClick={() => setSelected(item.id)}
                    onDoubleClick={() => {
                      const free = decks.find((d) => !d.playing) ?? decks[0];
                      onLoad(free, item.id);
                    }}
                  >
                    <span className="sl-art" style={{ backgroundImage: `url("${artOf(item)}")` }} />
                    <span className="sl-title">{item.title}</span>
                    <span className="sl-dim">{item.artist || "—"}</span>
                    <span className="sl-dim">{item.bpm ? item.bpm.toFixed(0) : ""}</span>
                    <span className="sl-key">{item.key?.camelot ?? ""}</span>
                    <span className="sl-dim">{item.duration ? formatTime(item.duration) : ""}</span>
                    <span className="sl-actions">
                      {loadButtons(item)}
                      <button
                        type="button"
                        className="studio-btn studio-mini"
                        onClick={(e) => {
                          e.stopPropagation();
                          enqueue(item.id);
                        }}
                        aria-label={t("Add to queue")}
                      >
                        +
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <aside
        className="sl-queue"
        aria-label={t("Queue")}
        data-drop={queueOver || undefined}
        onDragOver={(e) => {
          if (!isStudioDrag(e)) return;
          e.preventDefault();
          setQueueOver(true);
        }}
        onDragLeave={() => setQueueOver(false)}
        onDrop={(e) => void dropOnQueue(e)}
      >
        <div className="sl-bar">
          <strong>{t("Queue")}</strong>
          <span className="sl-count">
            {t("{n} songs", { n: queue.length })} · {formatTime(queueTime)}
          </span>
        </div>
        {queueNote && <p className="studio-empty">{queueNote}</p>}
        {queue.length === 0 ? (
          <p className="studio-empty">{t("Press + on a song, or drag it here, to line it up.")}</p>
        ) : (
          queue.map((item, i) => (
            <div
              key={item.id}
              className="sl-qrow"
              data-leaving={leaving === item.id || undefined}
              draggable
              title={t("Drag to move it in the queue, or onto a deck")}
              onDragStart={(e) => {
                setQueueFrom(i);
                startStudioDrag(e, { kind: "crate", id: item.id });
              }}
              onDragEnd={() => setQueueFrom(null)}
              onDrop={(e) => {
                if (queueFrom === null) return;
                e.preventDefault();
                e.stopPropagation();
                setQueueOver(false);
                moveInQueue(queueFrom, i);
                setQueueFrom(null);
              }}
            >
              <span className="sl-art" style={{ backgroundImage: `url("${artOf(item)}")` }} />
              <div className="sl-qtext">
                <strong>{item.title}</strong>
                <span>{item.artist || "—"}</span>
              </div>
              <div className="sl-qmeta">
                <strong>{item.bpm ? `${item.bpm.toFixed(0)} BPM` : ""}</strong>
                <span>
                  <em>{item.key?.camelot ?? ""}</em>{" "}
                  {item.duration ? formatTime(item.duration) : ""}
                </span>
              </div>
              <span className="sl-actions">
                {loadButtons(item)}
                <button
                  type="button"
                  className="studio-btn studio-mini"
                  onClick={() => unqueue(item.id)}
                  aria-label={t("Remove from queue")}
                >
                  ✕
                </button>
              </span>
            </div>
          ))
        )}
      </aside>
    </section>
  );
}
