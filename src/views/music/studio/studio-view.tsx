import { useState } from "react";
import type { StudioDeck } from "@/lib/music/studio/deck";
import { studio, useStudio } from "@/lib/music/studio/engine";
import { addFiles, prepare, useCrate, type CrateItem } from "@/lib/music/studio/library";
import { useSongArt } from "@/lib/music/dj/art";
import { coverArt } from "@/lib/music/cover-art";
import { useT } from "@/lib/i18n";
import { StudioDeckPanel } from "./studio-deck";
import { StudioLibrary } from "./studio-library";
import { StudioMixer } from "./studio-mixer";
import { StudioWaves } from "./studio-wave";
import "./studio.css";

/**
 * DJ Studio: two or four decks of your own music with turntables, colour waveforms, beat sync,
 * cue points, hot cues, loops, pitch, a three-band EQ and filter mixer with crossfader curves,
 * and a limiter on the master. The audio is processed in the app (Web Audio), so it plays files
 * the app can read: music files on this device.
 */
export function DjStudio() {
  const t = useT();
  const engine = useStudio();
  const decks = engine.all.slice(0, engine.deckCount);
  const [zoom, setZoom] = useState(1);
  const [busyDeck, setBusyDeck] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const crate = useCrate();
  // Covers: the file's own, else the online catalog by artist and title, else generated art.
  const online = useSongArt(crate.crate.filter((c) => !c.art && c.artist));
  const artOf = (item: CrateItem): string =>
    item.art ?? online(item)?.art ?? coverArt(item.title, item.artist || item.title);
  const deckArt = (deck: StudioDeck) => {
    const item = deck.track ? crate.crate.find((c) => c.id === deck.track!.id) : undefined;
    return item ? artOf(item) : null;
  };

  const load = async (deck: StudioDeck, id: string) => {
    if (deck.playing && !window.confirm(t("Deck is playing. Load the new track anyway?"))) return;
    setBusyDeck(deck.index);
    setError(null);
    try {
      const track = await prepare(studio.context, id);
      deck.load(track);
    } catch (e) {
      setError(
        e instanceof Error && /decode|Decoding|EncodingError/i.test(`${e.name} ${e.message}`)
          ? t("That file couldn't be played. Try an MP3, M4A, WAV or FLAC file.")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusyDeck(null);
    }
  };

  return (
    <div
      className={`studio${engine.deckCount === 4 ? " studio-four" : ""}${dropping ? " is-dropping" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <div className="studio-top">
        <strong className="studio-brand">{t("DJ Studio")}</strong>
        <div className="studio-top-controls">
          <span className="studio-label">{t("Decks")}</span>
          {([2, 4] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={`studio-btn studio-mini${engine.deckCount === n ? " is-on" : ""}`}
              onClick={() => engine.setDeckCount(n)}
            >
              {n}
            </button>
          ))}
          <span className="studio-label">{t("Zoom")}</span>
          <button
            type="button"
            className="studio-btn studio-mini"
            onClick={() => setZoom((z) => Math.max(0.25, z / 1.5))}
            aria-label={t("Zoom out")}
          >
            −
          </button>
          <button
            type="button"
            className="studio-btn studio-mini"
            onClick={() => setZoom((z) => Math.min(6, z * 1.5))}
            aria-label={t("Zoom in")}
          >
            +
          </button>
        </div>
      </div>
      <StudioWaves decks={decks} zoom={zoom} />
      <div className="studio-console">
        <div className="studio-deck-col">
          {decks
            .filter((d) => d.index % 2 === 0)
            .map((d) => (
              <StudioDeckPanel
                key={d.index}
                deck={d}
                compact={engine.deckCount === 4}
                art={deckArt(d)}
              />
            ))}
        </div>
        <StudioMixer decks={decks} />
        <div className="studio-deck-col">
          {decks
            .filter((d) => d.index % 2 === 1)
            .map((d) => (
              <StudioDeckPanel
                key={d.index}
                deck={d}
                compact={engine.deckCount === 4}
                art={deckArt(d)}
              />
            ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="studio-error">
          {error}
        </p>
      )}
      <StudioLibrary
        decks={decks}
        onLoad={(d, id) => void load(d, id)}
        busyDeck={busyDeck}
        artOf={artOf}
      />
    </div>
  );
}
