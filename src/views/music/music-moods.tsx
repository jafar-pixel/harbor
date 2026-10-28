import { useEffect, useState, type CSSProperties } from "react";
import { Headphones, Moon, Pause, Play, Save, Timer, Trash2, Waves } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  BRAINWAVES,
  MOOD_PRESETS,
  NATURE,
  NOISES,
  type AnySoundDef,
  type SoundMix,
} from "@/lib/music/sounds/catalog";
import {
  clearMix,
  deleteSavedMix,
  loadMix,
  saveCurrentMix,
  setBeatMode,
  setLayerVolume,
  setMasterVolume,
  setSleepTimer,
  startFocus,
  toggleLayer,
  toggleSounds,
  useSounds,
} from "@/lib/music/sounds/engine";
import { MoodVisualStage } from "./mood-visual";
import "./music-moods.css";

const SLEEP_OPTIONS = [0, 15, 30, 60, 90];
const FOCUS_OPTIONS = [25, 50];

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Moods & Sounds: brainwave beats, noise colours and nature sounds, layered in a mixer that
 * keeps playing anywhere in the app. Relaxation and focus aids, with no health claims.
 */
export function MusicMoods() {
  const t = useT();
  const sounds = useSounds();
  const [name, setName] = useState("");
  const now = useNow(!!sounds.sleep || !!sounds.focus);
  const volumeOf = (id: string) => sounds.mix.layers.find((l) => l.id === id)?.volume;
  const activePreset = MOOD_PRESETS.find(
    (p) =>
      p.layers.length === sounds.mix.layers.length &&
      p.layers.every((l) => sounds.mix.layers.some((m) => m.id === l.id)),
  );

  const tile = (def: AnySoundDef) => {
    const volume = volumeOf(def.id);
    const on = volume !== undefined;
    return (
      <div
        key={def.id}
        className="music-moods-tile"
        data-on={on}
        style={{ "--tile": def.tint } as CSSProperties}
      >
        <button type="button" aria-pressed={on} onClick={() => toggleLayer(def.id)}>
          <span className="music-moods-tile-name">{t(def.name)}</span>
          <span className="music-moods-tile-blurb">
            {def.kind === "brainwave" ? `${def.range[0]}–${def.range[1]} Hz · ` : ""}
            {t(def.blurb)}
          </span>
        </button>
        {on && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label={t("{sound} volume", { sound: t(def.name) })}
            onChange={(e) => setLayerVolume(def.id, Number(e.target.value))}
          />
        )}
      </div>
    );
  };

  return (
    <section className="music-moods">
      <header className="music-moods-head">
        <Waves size={28} />
        <div>
          <h2>{t("Moods & Sounds")}</h2>
          <p>
            {t(
              "Layer brainwave beats, noise and nature sounds. They keep playing under your music and anywhere in the app.",
            )}
          </p>
        </div>
      </header>

      <MoodVisualStage />

      <div className="music-moods-presets" role="list" aria-label={t("Quick moods")}>
        {MOOD_PRESETS.map((preset) => (
          <button
            key={preset.id}
            role="listitem"
            type="button"
            className="music-moods-preset"
            aria-pressed={activePreset?.id === preset.id}
            onClick={() => loadMix(preset)}
          >
            <strong>{t(preset.name)}</strong>
            <span>{t(preset.blurb)}</span>
          </button>
        ))}
      </div>

      <div className="music-moods-bar">
        <button
          type="button"
          className="music-moods-play"
          onClick={toggleSounds}
          disabled={!sounds.mix.layers.length}
          aria-label={sounds.playing ? t("Pause sounds") : t("Play sounds")}
        >
          {sounds.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <label className="music-moods-master">
          <span>{t("Volume")}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sounds.master}
            onChange={(e) => setMasterVolume(Number(e.target.value))}
          />
        </label>
        <label className="music-moods-select">
          <Moon size={15} />
          <select
            aria-label={t("Sleep timer")}
            value={sounds.sleep?.minutes ?? 0}
            onChange={(e) => setSleepTimer(Number(e.target.value))}
          >
            {SLEEP_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m ? t("Sleep in {n} min", { n: m }) : t("No sleep timer")}
              </option>
            ))}
          </select>
          {sounds.sleep && (
            <span className="music-moods-count">{countdown(sounds.sleep.endsAt - now)}</span>
          )}
        </label>
        <div className="music-moods-focus">
          <Timer size={15} />
          {sounds.focus ? (
            <>
              <span className="music-moods-count">{countdown(sounds.focus.endsAt - now)}</span>
              <button type="button" onClick={() => startFocus(0)}>
                {t("End focus")}
              </button>
            </>
          ) : (
            FOCUS_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                disabled={!sounds.mix.layers.length}
                onClick={() => startFocus(m)}
              >
                {t("Focus {n} min", { n: m })}
              </button>
            ))
          )}
        </div>
        {sounds.mix.layers.length > 0 && (
          <button type="button" className="music-moods-clear" onClick={clearMix}>
            {t("Clear")}
          </button>
        )}
      </div>

      <section className="music-moods-group">
        <div className="music-moods-group-head">
          <h3>{t("Brainwave beats")}</h3>
          <div className="music-moods-mode" role="radiogroup" aria-label={t("Beat style")}>
            <button
              type="button"
              role="radio"
              aria-checked={sounds.mix.beatMode === "binaural"}
              onClick={() => setBeatMode("binaural")}
            >
              <Headphones size={14} /> {t("Binaural (headphones)")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={sounds.mix.beatMode === "isochronic"}
              onClick={() => setBeatMode("isochronic")}
            >
              {t("Isochronic (speakers)")}
            </button>
          </div>
        </div>
        <div className="music-moods-grid">{BRAINWAVES.map(tile)}</div>
      </section>

      <section className="music-moods-group">
        <h3>{t("Noise colors")}</h3>
        <div className="music-moods-grid">{NOISES.map(tile)}</div>
      </section>

      <section className="music-moods-group">
        <h3>{t("Nature")}</h3>
        <div className="music-moods-grid">{NATURE.map(tile)}</div>
      </section>

      <section className="music-moods-group">
        <h3>{t("Saved mixes")}</h3>
        <form
          className="music-moods-save"
          onSubmit={(e) => {
            e.preventDefault();
            saveCurrentMix(name);
            setName("");
          }}
        >
          <input
            value={name}
            maxLength={60}
            placeholder={t("Name this mix")}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={!sounds.mix.layers.length}>
            <Save size={15} /> {t("Save mix")}
          </button>
        </form>
        {sounds.saved.length > 0 && (
          <ul className="music-moods-saved">
            {sounds.saved.map((mix: SoundMix) => (
              <li key={mix.name}>
                <button type="button" onClick={() => loadMix(mix)}>
                  <strong>{mix.name}</strong>
                  <span>{t("{n} sounds", { n: mix.layers.length })}</span>
                </button>
                <button
                  type="button"
                  aria-label={t("Delete {name}", { name: mix.name })}
                  onClick={() => deleteSavedMix(mix.name)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="music-moods-note">
        {t(
          "Moods & Sounds are for relaxation and focus. They aren't a medical treatment. Keep the volume comfortable.",
        )}
      </p>
    </section>
  );
}
