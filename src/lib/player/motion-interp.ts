import { invoke } from "@tauri-apps/api/core";
import { readMpvVideoFps } from "./mpv-properties";

const SMOOTH: Array<[string, unknown]> = [
  ["video-sync", "display-resample"],
  ["interpolation", "yes"],
  ["tscale", "oversample"],
];

/**
 * True when the screen's refresh rate is not a whole multiple of the video's frame rate (24 fps
 * on a 75 Hz screen, 25 fps on 60 Hz), so frames are held for uneven times and motion judders.
 */
export function refreshJudders(displayFps: number, videoFps: number): boolean {
  if (!(displayFps > 0) || !(videoFps > 0)) return false;
  const ratio = displayFps / videoFps;
  // display-resample absorbs up to a few percent of speed difference on its own.
  return Math.abs(ratio - Math.round(ratio)) / ratio > 0.02;
}

async function displayFps(): Promise<number | null> {
  try {
    const value = await invoke<number | string>("mpv_get_property", { name: "display-fps" });
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Motion smoothing on or off. With it off, `auto` still turns it on for this video when the
 * screen's refresh rate cannot show the video's frame rate evenly.
 */
export async function applyMotionInterp(on: boolean, auto = false): Promise<void> {
  let smooth = on;
  if (!on && auto) {
    const [display, video] = await Promise.all([displayFps(), readMpvVideoFps()]);
    smooth = display != null && video != null && refreshJudders(display, video);
  }
  const props: Array<[string, unknown]> = smooth
    ? SMOOTH
    : [
        ["interpolation", "no"],
        // Pace frames to the display (audio is resampled slightly to match) rather than to the
        // audio clock: removes the judder fast sports motion shows with "audio" sync.
        ["video-sync", "display-resample"],
      ];
  await Promise.all(
    props.map(([name, value]) => invoke("mpv_set_property", { name, value }).catch(() => {})),
  );
}
