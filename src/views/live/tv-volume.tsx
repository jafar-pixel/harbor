import { useSyncExternalStore } from "react";
import { Minus, Plus, Volume2, VolumeX } from "lucide-react";
import { useT } from "@/lib/i18n";
import { nativeTvAvailable } from "@/lib/player/native-tv/shell";

/** Sound for the Live TV previews (the Your TV screen and the Channels preview), kept per device. */
type TvVolume = { volume: number; muted: boolean };

const KEY = "jl.live.tv-volume.v1";
const STEP = 0.1;
const listeners = new Set<() => void>();

function load(): TvVolume {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<TvVolume> | null;
    const volume = typeof raw?.volume === "number" ? clamp(raw.volume) : 0.6;
    // On the TV app the Shield's player plays the preview, which may start with sound.
    return { volume, muted: raw?.muted ?? !nativeTvAvailable() };
  } catch {
    return { volume: 0.6, muted: !nativeTvAvailable() };
  }
}

let state = load();

function clamp(v: number): number {
  return Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
}

function set(next: TvVolume) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the level lasts for this visit */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTvVolume() {
  const s = useSyncExternalStore(subscribe, () => state);
  // A browser refuses to start a stream with sound before the viewer has interacted with the
  // page, and the preview would stay black, so sound waits for that first interaction.
  // The TV app's own player has no such rule, and remote presses don't count as interaction.
  const activated =
    nativeTvAvailable() ||
    typeof navigator === "undefined" ||
    navigator.userActivation?.hasBeenActive !== false;
  return {
    volume: s.volume,
    muted: s.muted || s.volume === 0 || !activated,
    step: (dir: 1 | -1) => {
      const volume = clamp(s.volume + dir * STEP);
      set({ volume, muted: volume === 0 });
    },
    toggleMute: () => set({ volume: s.volume === 0 ? 0.5 : s.volume, muted: !s.muted }),
  };
}

const BTN =
  "flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/65";

/** Mute, volume down and volume up, for a live preview. */
export function TvVolumeControls() {
  const t = useT();
  const { volume, muted, step, toggleMute } = useTvVolume();
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      className="flex items-center gap-1.5"
      onClick={stop}
      onDoubleClick={stop}
      role="group"
      aria-label={t("Volume")}
    >
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? t("Unmute") : t("Mute")}
        aria-pressed={muted}
        className={BTN}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={volume === 0}
        aria-label={t("Volume down")}
        className={`${BTN} disabled:opacity-40`}
      >
        <Minus size={18} />
      </button>
      <span className="min-w-[3ch] text-center text-[13px] font-semibold tabular-nums text-white drop-shadow">
        {muted ? 0 : Math.round(volume * 100)}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={volume === 1 && !muted}
        aria-label={t("Volume up")}
        className={`${BTN} disabled:opacity-40`}
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
