import { Laptop, MonitorSmartphone, Play, Tv } from "lucide-react";
import { useT } from "@/lib/i18n";
import { startFromSong } from "@/lib/music/dj/session";
import { useOtherDevices, type DevicePlaying } from "@/lib/music/now-playing-sync";
import { requestMusicTab } from "@/lib/music/social/inbox";
import { useSettings } from "@/lib/settings";
import "./music-other-devices.css";

const ICON = { desktop: Laptop, web: MonitorSmartphone, android: Tv } as const;

/** "Listening on Desktop: Award Tour · Play here": the listener's other devices, at the top of Music. */
export function MusicOtherDevices() {
  const t = useT();
  const devices = useOtherDevices();
  const { settings } = useSettings();
  if (!devices.length) return null;

  const playHere = (d: DevicePlaying) => {
    void startFromSong(
      { artist: d.artist, title: d.title, why: "", videoId: d.video_id },
      settings.musicStyles ?? [],
      d.device_name,
    );
    requestMusicTab("dj");
  };

  return (
    <section className="music-devices" aria-label={t("Your other devices")}>
      {devices.map((d) => {
        const Icon = ICON[d.device_kind] ?? Laptop;
        return (
          <article key={d.device_id} className="music-device">
            {d.art ? (
              <img src={d.art} alt="" loading="lazy" />
            ) : (
              <span className="music-device-art" />
            )}
            <div>
              <span className="music-device-where">
                <Icon size={13} />
                {d.paused
                  ? t("Paused on {device}", { device: d.device_name })
                  : t("Listening on {device}", { device: d.device_name })}
                {!d.paused && (
                  <span className="music-device-live" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </span>
              <strong>{d.title}</strong>
              {d.artist && <em>{d.artist}</em>}
            </div>
            <button type="button" onClick={() => playHere(d)}>
              <Play size={15} fill="currentColor" /> {t("Play here")}
            </button>
          </article>
        );
      })}
    </section>
  );
}
