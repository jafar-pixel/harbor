import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import {
  activeJlPreset,
  applyJlPreset,
  JL_PRESETS,
  JL_PRESET_KEYS,
  SPORTS_HDR_PEAK,
} from "@/lib/player/jl-presets";
import { ROW_ACTION, ROW_ACTION_PRIMARY, SettingRow } from "../kit";
import { Section } from "../shared";
import { TweakSlider, useTweaks } from "./dials";

/** JL Media Vision's own one-tap mpv setups, with the Sports HDR brightness beside them. */
export function JlPresetsSection() {
  const t = useT();
  const { settings, update } = useSettings();
  const { tweaks, setTweak } = useTweaks();
  const player = {
    playerHdrToSdr: settings.playerHdrToSdr,
    playerRtxHdr: settings.playerRtxHdr,
    playerRtxVsr: settings.playerRtxVsr,
  };
  const active = activeJlPreset(tweaks, player);
  const current = JL_PRESETS.find((p) => p.id === active);
  const clearPreset = () => {
    const next = { ...tweaks };
    for (const k of JL_PRESET_KEYS) delete next[k];
    update({ mpvTweaks: next });
  };
  return (
    <Section
      title={t("JL presets")}
      subtitle={t(
        "Tuned setups for your screen and graphics card. Each one sets the video options and the RTX and HDR switches together. Restart playback to apply.",
      )}
    >
      <SettingRow
        wide
        label={t("Preset")}
        desc={current ? t(current.sub) : t("No preset. Playback uses only the settings below.")}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            aria-pressed={active === null}
            onClick={clearPreset}
            className={active === null ? ROW_ACTION_PRIMARY : ROW_ACTION}
          >
            {t("None")}
          </button>
          {JL_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={active === p.id}
              title={t(p.sub)}
              onClick={() => update({ mpvTweaks: applyJlPreset(tweaks, p), ...p.player })}
              className={active === p.id ? ROW_ACTION_PRIMARY : ROW_ACTION}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
      </SettingRow>
      {tweaks["inverse-tone-mapping"] === "yes" && (
        <SettingRow
          wide
          label={t("HDR brightness for standard video")}
          desc={t(
            "How bright games and other standard video get when turned into HDR, in nits. Lower it if colors look blown out; raise it for more punch.",
          )}
        >
          <TweakSlider
            tweaks={tweaks}
            setTweak={setTweak}
            mpvKey="target-peak"
            label={t("HDR brightness for standard video")}
            min={SPORTS_HDR_PEAK.min}
            max={SPORTS_HDR_PEAK.max}
            step={SPORTS_HDR_PEAK.step}
            def={SPORTS_HDR_PEAK.def}
            fmt={(v) => `${Math.round(v)} nits`}
          />
        </SettingRow>
      )}
    </Section>
  );
}
