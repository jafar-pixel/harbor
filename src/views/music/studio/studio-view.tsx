import { useState } from "react";
import type { StudioDeck } from "@/lib/music/studio/deck";
import { studio, useStudio, type XfadeCurve } from "@/lib/music/studio/engine";
import { addFiles, prepare, useCrate, type CrateItem } from "@/lib/music/studio/library";
import { useSongArt } from "@/lib/music/dj/art";
import { coverArt } from "@/lib/music/cover-art";
import { useT } from "@/lib/i18n";
import { Knob } from "./studio-controls";
import {
  ChannelStrip,
  DeckHeader,
  DeckJog,
  DeckPitch,
  DeckTransport,
  type DeckLook,
} from "./studio-deck";
import { StudioLibrary } from "./studio-library";
import { StudioWaves } from "./studio-wave";
import "./studio.css";

const CURVES: { id: XfadeCurve; label: string }[] = [
  { id: "smooth", label: "Smooth" },
  { id: "linear", label: "Linear" },
  { id: "cut", label: "Scratch" },
];

/**
 * DJ Studio, laid out like a two-deck DJ app: track headers with whole-track waveforms across
 * the top; decks on the outside with their EQ and faders, and the scrolling waveforms between
 * them; transport and the crossfader below; the library and queue at the bottom. Four decks
 * stack two per side. Audio runs in the app (Web Audio) on the music files you add.
 */
export function DjStudio() {
  const t = useT();
  const engine = useStudio();
  const decks = engine.all.slice(0, engine.deckCount);
  const [zoom, setZoom] = useState(1);
  const [look, setLook] = useState<DeckLook>("turntable");
  const [pads, setPads] = useState(true);
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
      deck.load(await prepare(studio.context, id));
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

  const left = decks.filter((d) => d.index % 2 === 0);
  const right = decks.filter((d) => d.index % 2 === 1);
  const side = (list: StudioDeck[], mirror: boolean) => (
    <div className={`sd-side${mirror ? " is-mirror" : ""}`}>
      {list.map((deck) => (
        <div key={deck.index} className="sd-deck" data-deck={deck.index}>
          <DeckPitch deck={deck} />
          <DeckJog deck={deck} art={deckArt(deck)} look={engine.deckCount === 4 ? "jog" : look} />
          <ChannelStrip deck={deck} />
        </div>
      ))}
    </div>
  );

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
          <span className="studio-label">{t("View")}</span>
          {(["turntable", "jog"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={`studio-btn studio-mini${look === id ? " is-on" : ""}`}
              onClick={() => setLook(id)}
            >
              {id === "turntable" ? t("Turntables") : t("Classic")}
            </button>
          ))}
          <button
            type="button"
            className={`studio-btn studio-mini${pads ? " is-on" : ""}`}
            onClick={() => setPads(!pads)}
          >
            {t("Pads")}
          </button>
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
      <div className="sd-heads">
        <div className="sd-heads-col">
          {left.map((d) => (
            <DeckHeader key={d.index} deck={d} art={deckArt(d)} />
          ))}
        </div>
        <div className="sd-heads-col">
          {right.map((d) => (
            <DeckHeader key={d.index} deck={d} art={deckArt(d)} />
          ))}
        </div>
      </div>
      <div className="sd-console">
        {side(left, false)}
        <StudioWaves decks={decks} zoom={zoom} />
        {side(right, true)}
      </div>
      <div className="sd-lower">
        <div className="sd-lower-col">
          {left.map((d) => (
            <DeckTransport key={d.index} deck={d} pads={pads} />
          ))}
        </div>
        <div className="sd-mixer">
          <div className="studio-xfade">
            <div className="sd-assign">
              {decks.map((deck) => (
                <button
                  key={deck.index}
                  type="button"
                  className="studio-btn studio-mini"
                  data-deck={deck.index}
                  onClick={() =>
                    engine.setSide(
                      deck,
                      deck.side === "A" ? "thru" : deck.side === "thru" ? "B" : "A",
                    )
                  }
                  title={t("Crossfader side for deck {name}", { name: "ABCD"[deck.index] })}
                >
                  {"ABCD"[deck.index]}→{deck.side === "thru" ? t("Thru") : deck.side}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={engine.crossfader}
              aria-label={t("Crossfader")}
              onChange={(e) => engine.setCrossfader(Number(e.target.value))}
              onDoubleClick={() => engine.setCrossfader(0)}
            />
          </div>
          <div className="studio-master">
            <div className="studio-curves" role="group" aria-label={t("Crossfader curve")}>
              {CURVES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`studio-btn studio-mini${engine.curve === c.id ? " is-on" : ""}`}
                  onClick={() => engine.setCurve(c.id)}
                >
                  {t(c.label)}
                </button>
              ))}
            </div>
            <Knob
              label={t("Master")}
              value={engine.masterVolume}
              min={0}
              max={1.2}
              center={0.9}
              onChange={(v) => engine.setMasterVolume(v)}
            />
          </div>
        </div>
        <div className="sd-lower-col is-mirror">
          {right.map((d) => (
            <DeckTransport key={d.index} deck={d} pads={pads} />
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
