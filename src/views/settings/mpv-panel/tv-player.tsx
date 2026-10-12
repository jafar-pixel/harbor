import { useMemo } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { describeNativeTvCapabilities, nativeTvCapabilities } from "@/lib/player/native-tv/shell";
import { ROW_DESC, Section, Segmented, ToggleRow } from "../shared";
import { SettingRow } from "../kit";

/** Video tuning inside the Android TV app, where ExoPlayer plays instead of mpv. */
export function TvPlayerSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const caps = useMemo(() => nativeTvCapabilities(), []);

  return (
    <div className="harbor-cascade flex flex-col gap-10">
      <Section
        title={t("TV player (NVIDIA Shield)")}
        subtitle={t(
          "How the TV app's built-in player uses your TV and receiver. Changes apply to the next video you play.",
        )}
      >
        <p className={`max-w-[66ch] ${ROW_DESC}`}>
          {caps
            ? t("This TV: {caps}", { caps: describeNativeTvCapabilities(caps) })
            : t("Update the JL Media Vision TV app to see what this TV supports.")}
        </p>
        <ToggleRow
          label={t("Match frame rate and resolution")}
          sub={t(
            "While a video plays full screen, switches the TV to its frame rate so 24 fps films play without judder, and up to 4K when the video is 4K. The screen may go dark for a moment as it switches.",
          )}
          value={settings.tvMatchFrameRate}
          onChange={(v) => update({ tvMatchFrameRate: v })}
        />
        <SettingRow
          wide
          label={t("Maximum resolution")}
          desc={t(
            "Auto picks the best the TV can show, up to 4K. Lower it if streams stall on a slow connection.",
          )}
        >
          <Segmented
            value={settings.tvMaxResolution}
            options={[
              { value: "auto", label: t("Auto") },
              { value: "1080p", label: "1080p" },
              { value: "720p", label: "720p" },
            ]}
            onChange={(v) => update({ tvMaxResolution: v })}
          />
        </SettingRow>
        <ToggleRow
          label={t("Audio passthrough")}
          sub={t(
            "Sends Dolby Digital, Dolby Digital Plus, TrueHD and DTS to your receiver or soundbar undecoded when it supports them. Turn off if a video plays without sound.",
          )}
          value={settings.tvAudioPassthrough}
          onChange={(v) => update({ tvAudioPassthrough: v })}
        />
        <ToggleRow
          label={t("Tunneled playback")}
          sub={t(
            "Hands video straight to the TV's decoder for smoother 4K. Some streams fail to start with it on.",
          )}
          value={settings.tvTunneling}
          onChange={(v) => update({ tvTunneling: v })}
        />
      </Section>
    </div>
  );
}
