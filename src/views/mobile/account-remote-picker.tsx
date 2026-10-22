import { useMobileRemote } from "./mobile-remote";
import { useJlSession } from "@/lib/jl/account/client";
import { selectAccountRemote, useAccountRemote } from "@/lib/remote/account-remote";
import { useT } from "@/lib/i18n";
export function AccountRemotePicker() {
  const t = useT(),
    session = useJlSession(),
    state = useAccountRemote();
  const { playTarget, setPreferPhone } = useMobileRemote();
  return (
    <section
      className="shrink-0 border-b border-edge-soft bg-canvas px-4 py-3"
      aria-label={t("Remote controller")}
    >
      <label className="flex flex-wrap items-center gap-3 text-sm font-semibold text-ink">
        {t("Remote controller")}
        <select
          className="min-h-11 min-w-48 flex-1 rounded-lg border border-edge bg-elevated px-3"
          value={state.selected ?? ""}
          disabled={!session || !state.ready}
          onChange={(e) => {
            selectAccountRemote(e.target.value || null);
            setPreferPhone(!e.target.value);
          }}
        >
          <option value="">{t("Choose your TV or desktop")}</option>
          {state.devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex gap-2" aria-label={t("Playback destination")}>
        <button
          type="button"
          aria-pressed={playTarget === "phone"}
          onClick={() => setPreferPhone(true)}
          className="min-h-11 flex-1 rounded-lg border border-edge px-3 text-sm text-ink aria-pressed:bg-accent aria-pressed:text-canvas"
        >
          {t("Watch here")}
        </button>
        <button
          type="button"
          aria-pressed={playTarget === "host"}
          disabled={!state.selected}
          onClick={() => setPreferPhone(false)}
          className="min-h-11 flex-1 rounded-lg border border-edge px-3 text-sm text-ink aria-pressed:bg-accent aria-pressed:text-canvas disabled:opacity-40"
        >
          {t("Control display")}
        </button>
      </div>
      <p role="status" className="mt-2 text-xs text-ink-muted">
        {!session
          ? t("Sign into your JL account to see your displays.")
          : state.error
            ? t(state.error)
            : !state.devices.length
              ? t("On your display, enable the remote controller in Settings → Remotes.")
              : state.selected
                ? t("Controller connected to your display.")
                : t("Select a display before using the remote.")}
      </p>
    </section>
  );
}
