import { useRef, useState } from "react";
import type { StudioDeck } from "@/lib/music/studio/deck";
import { addFiles, dequeue, enqueue, useCrate, type CrateItem } from "@/lib/music/studio/library";
import { useT } from "@/lib/i18n";
import { formatTime } from "./studio-controls";

type Tab = "crate" | "queue" | "history";
const DECK_NAMES = ["A", "B", "C", "D"];

/**
 * The library under the decks: music files added this session (files or a whole folder, or
 * dropped onto the window), the queue and the history. Each row loads onto a deck.
 */
export function StudioLibrary({
  decks,
  onLoad,
  busyDeck,
  artOf,
}: {
  decks: StudioDeck[];
  onLoad: (deck: StudioDeck, id: string) => void;
  busyDeck: number | null;
  artOf: (item: CrateItem) => string;
}) {
  const t = useT();
  const crate = useCrate();
  const [tab, setTab] = useState<Tab>("crate");
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(true);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const byId = new Map(crate.crate.map((c) => [c.id, c]));
  const list: CrateItem[] = (
    tab === "crate"
      ? crate.crate
      : (tab === "queue" ? crate.queue : crate.history)
          .map((id) => byId.get(id))
          .filter((c): c is CrateItem => !!c)
  ).filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || `${c.artist} ${c.title}`.toLowerCase().includes(q);
  });

  const loadButtons = (item: CrateItem) => (
    <>
      {decks.map((deck) => (
        <button
          key={deck.index}
          type="button"
          className="studio-btn studio-mini"
          data-deck={deck.index}
          disabled={busyDeck === deck.index || crate.loading[item.id]}
          onClick={() => onLoad(deck, item.id)}
          title={t("Load on deck {name}", { name: DECK_NAMES[deck.index] })}
        >
          {DECK_NAMES[deck.index]}
        </button>
      ))}
      {tab === "queue" ? (
        <button
          type="button"
          className="studio-btn studio-mini"
          onClick={() => dequeue(item.id)}
          aria-label={t("Remove from queue")}
        >
          ✕
        </button>
      ) : (
        <button
          type="button"
          className="studio-btn studio-mini"
          onClick={() => enqueue(item.id)}
          aria-label={t("Add to queue")}
        >
          +
        </button>
      )}
    </>
  );

  return (
    <section className="studio-library" aria-label={t("Library")}>
      <div className="studio-library-bar">
        <div className="studio-tabs" role="tablist">
          {(["crate", "queue", "history"] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`studio-btn studio-mini${tab === id ? " is-on" : ""}`}
              onClick={() => setTab(id)}
            >
              {id === "crate"
                ? t("Your music ({n})", { n: crate.crate.length })
                : id === "queue"
                  ? t("Queue ({n})", { n: crate.queue.length })
                  : t("History")}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="studio-btn studio-mini"
          onClick={() => setGrid(!grid)}
          aria-label={grid ? t("Show as a list") : t("Show covers")}
        >
          {grid ? "☰" : "▦"}
        </button>
        <input
          className="studio-search"
          type="search"
          placeholder={t("Search")}
          aria-label={t("Search the library")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="studio-btn" onClick={() => files.current?.click()}>
          {t("Add music files")}
        </button>
        <button type="button" className="studio-btn" onClick={() => folder.current?.click()}>
          {t("Add a folder")}
        </button>
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
      </div>
      {list.length === 0 ? (
        <p className="studio-empty">
          {tab === "crate"
            ? t(
                "Add your MP3, FLAC, WAV or M4A files, or drop them anywhere on this screen. They stay on this computer.",
              )
            : tab === "queue"
              ? t("Add songs to the queue with + to line up what plays next.")
              : t("Tracks you load on a deck show up here.")}
        </p>
      ) : grid ? (
        <div className="studio-grid" role="list">
          {list.map((item) => (
            <div key={item.id} className="studio-tile" role="listitem">
              <div className="studio-tile-art" style={{ backgroundImage: `url("${artOf(item)}")` }}>
                <div className="studio-tile-load">{loadButtons(item)}</div>
              </div>
              <strong>{item.title}</strong>
              <span>
                {item.artist || "—"}
                {item.bpm ? ` · ${item.bpm.toFixed(0)} BPM` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="studio-rows" role="list">
          {list.map((item) => (
            <div key={item.id} className="studio-row" role="listitem">
              <span
                className="studio-row-art"
                style={{ backgroundImage: `url("${artOf(item)}")` }}
              />
              <div className="studio-row-title">
                <strong>{item.title}</strong>
                <span>{item.artist || "—"}</span>
              </div>
              <span className="studio-row-num">{item.bpm ? item.bpm.toFixed(0) : ""}</span>
              <span className="studio-row-num">
                {item.duration ? formatTime(item.duration) : ""}
              </span>
              <div className="studio-row-actions">{loadButtons(item)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
