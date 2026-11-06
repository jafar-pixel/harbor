import { useId } from "react";
import { Check, X } from "lucide-react";
import { ModalShell, useModalExit } from "@/components/modal-shell";
import { useT } from "@/lib/i18n";
import { setMainService, useMusicLinks } from "@/lib/music/account-link";
import { SERVICE_LABEL } from "@/lib/music/hub/library";
import {
  connectSpotifyWeb,
  disconnectSpotifyWeb,
  useSpotifyWeb,
} from "@/lib/music/spotify-web/auth";
import {
  connectYouTubeWeb,
  disconnectYouTubeWeb,
  useYouTubeWeb,
} from "@/lib/music/youtube-web/auth";

/**
 * Music Hub settings: connect or disconnect YouTube Music and Spotify and pick the main service.
 * These used to sit on the Hub's front card; they are settings, so they live here. YouTube Music
 * is the recommended service and leads the list (and the Hub) until the listener picks.
 */
export function MusicHubSettings({ onClose }: { onClose: () => void }) {
  const t = useT();
  const id = useId();
  const { closing, close } = useModalExit(onClose);
  const youtube = useYouTubeWeb();
  const spotify = useSpotifyWeb();
  const links = useMusicLinks();
  const main = links.main ?? "youtube";
  const services = [
    {
      key: "youtube" as const,
      connected: youtube.connected,
      error: youtube.error,
      connect: () => void connectYouTubeWeb(true),
      disconnect: disconnectYouTubeWeb,
      note: t("Your YouTube Music playlists, likes and music videos."),
    },
    {
      key: "spotify" as const,
      connected: spotify.connected,
      error: spotify.error,
      connect: () => void connectSpotifyWeb(),
      disconnect: disconnectSpotifyWeb,
      note: t("Your Spotify playlists and liked songs."),
    },
  ];

  return (
    <ModalShell closing={closing} onDismiss={close} width={560} labelledBy={id}>
      <section className="hub-settings">
        <header className="hub-settings-head">
          <h2 id={id}>{t("Music settings")}</h2>
          <button type="button" className="hub-icon" aria-label={t("Close")} onClick={close}>
            <X size={18} />
          </button>
        </header>
        <p className="hub-settings-sub">
          {t(
            "Connect once and the Hub fills with your playlists and the songs you love, on every device you sign in to.",
          )}
        </p>
        <ul className="hub-settings-list">
          {services.map((s) => (
            <li key={s.key} className="hub-settings-row" data-main={main === s.key}>
              <div className="hub-settings-info">
                <span className="hub-settings-name">
                  {SERVICE_LABEL[s.key]}
                  {s.key === "youtube" && (
                    <span className="hub-settings-badge">{t("Recommended")}</span>
                  )}
                </span>
                <span className="hub-settings-note">{s.note}</span>
                {s.error && (
                  <span role="alert" className="hub-settings-error">
                    {s.error}
                  </span>
                )}
              </div>
              <div className="hub-settings-actions">
                {s.connected ? (
                  <>
                    <span className="hub-service-on">
                      <Check size={14} /> {t("Connected")}
                    </span>
                    <button type="button" className="hub-pill" onClick={s.disconnect}>
                      {t("Disconnect")}
                    </button>
                  </>
                ) : (
                  <button type="button" className="hub-pill hub-pill-strong" onClick={s.connect}>
                    {t("Connect")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <fieldset className="hub-settings-main">
          <legend>{t("Main service")}</legend>
          <p className="hub-settings-note">
            {t("Its playlists and likes come first in the Hub and the Lounge.")}
          </p>
          <div className="hub-settings-choice">
            {services.map((s) => (
              <label key={s.key}>
                <input
                  type="radio"
                  name={`${id}-main`}
                  checked={main === s.key}
                  onChange={() => void setMainService(s.key)}
                />
                <span>{SERVICE_LABEL[s.key]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>
    </ModalShell>
  );
}
