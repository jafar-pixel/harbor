import { useT } from "@/lib/i18n";
import {
  MUSIC_EQ_FREQUENCIES,
  saveMusicAudioSettings,
  useMusicAudioSettings,
  type MusicAudioSettingsValue,
} from "@/lib/music/audio-settings";
import { MUSIC_EQ_PRESETS, matchEqPreset } from "@/lib/music/eq-presets";

function hz(f: number): string {
  return f >= 1000 ? `${f / 1000}k` : String(f);
}

/**
 * The music EQ on the website and phone: on/off, presets and ten bands, saved in this browser.
 * (The Windows app has the full audio settings, applied natively.)
 */
export function MusicWebEq() {
  const t = useT();
  const { settings } = useMusicAudioSettings();
  const save = (patch: Partial<MusicAudioSettingsValue>) =>
    void saveMusicAudioSettings({ ...settings, eqMode: "graphic", ...patch }).catch(
      () => undefined,
    );
  const preset = matchEqPreset(settings.eqBands);
  const on = settings.eqEnabled;

  return (
    <section className="flex max-w-[720px] flex-col gap-5 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-ink">{t("Equalizer")}</h2>
          <p className="text-[13.5px] text-ink-muted">
            {t(
              "Shapes songs from your files, Jellyfin and direct links. YouTube and Spotify play in their own players, which no app can change.",
            )}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("Equalizer")}
          onClick={() => save({ eqEnabled: !on })}
          className={`relative h-8 w-14 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
            on ? "bg-accent" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-1 size-6 rounded-full bg-white transition-all ${on ? "start-7" : "start-1"}`}
          />
        </button>
      </div>

      <div className={`flex flex-col gap-4 ${on ? "" : "pointer-events-none opacity-45"}`}>
        <div className="flex flex-wrap gap-2">
          {MUSIC_EQ_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={preset === p.id}
              onClick={() => save({ eqBands: [...p.bands] })}
              className={`h-9 rounded-full px-3.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
                preset === p.id
                  ? "bg-accent text-black"
                  : "bg-white/[0.07] text-ink-muted hover:bg-white/[0.12] hover:text-ink"
              }`}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2.5">
          {MUSIC_EQ_FREQUENCIES.map((f, i) => {
            const gain = settings.eqBands[i] ?? 0;
            return (
              <label key={f} className="grid grid-cols-[48px_1fr_56px] items-center gap-3">
                <span className="text-end font-mono text-[12.5px] text-ink-subtle">{hz(f)}</span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={gain}
                  aria-label={t("{hz} Hz", { hz: hz(f) })}
                  onChange={(e) => {
                    const bands = [...settings.eqBands];
                    bands[i] = Number(e.target.value);
                    save({ eqBands: bands });
                  }}
                  className="w-full accent-[var(--color-accent,#4f8cff)]"
                />
                <span className="font-mono text-[12.5px] tabular-nums text-ink-muted">
                  {gain > 0 ? "+" : ""}
                  {gain} dB
                </span>
              </label>
            );
          })}
        </div>

        <label className="grid grid-cols-[48px_1fr_56px] items-center gap-3">
          <span className="text-end text-[12.5px] text-ink-subtle">{t("Preamp")}</span>
          <input
            type="range"
            min={-12}
            max={6}
            step={0.5}
            value={settings.preampDb}
            aria-label={t("Preamp")}
            onChange={(e) => save({ preampDb: Number(e.target.value) })}
            className="w-full accent-[var(--color-accent,#4f8cff)]"
          />
          <span className="font-mono text-[12.5px] tabular-nums text-ink-muted">
            {settings.preampDb > 0 ? "+" : ""}
            {settings.preampDb} dB
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => save({ eqBands: Array(10).fill(0), preampDb: 0 })}
            className="h-9 rounded-full bg-white/[0.07] px-3.5 text-[13px] font-semibold text-ink-muted outline-none hover:bg-white/[0.12] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t("Reset")}
          </button>
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={settings.autoHeadroom}
              onChange={(e) => save({ autoHeadroom: e.target.checked })}
            />
            {t("Prevent distortion on loud songs")}
          </label>
        </div>
      </div>
    </section>
  );
}
