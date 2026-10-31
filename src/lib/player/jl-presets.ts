/**
 * JL Media Vision's own mpv setups, one tap each. A preset owns the mpv keys below: applying
 * one clears them, then sets its own, so presets never stack. It also sets the player toggles
 * it depends on (RTX Video, tonemapping) so the two never fight over the same picture.
 */
export type JlPresetId = "sports-hdr" | "vivid-rtx" | "cinema" | "smooth";

export type JlPreset = {
  id: JlPresetId;
  label: string;
  sub: string;
  tweaks: Record<string, string>;
  player: { playerHdrToSdr: boolean; playerRtxHdr: boolean; playerRtxVsr: boolean };
};

export const JL_PRESET_KEYS = [
  "inverse-tone-mapping",
  "target-peak",
  "tone-mapping",
  "saturation",
  "deband",
  "interpolation",
  "tscale",
  "video-sync",
  "scale",
  "cscale",
  "sharpen",
];

/** Nits the Sports HDR preset expands standard video to; the brightness slider moves it. */
export const SPORTS_HDR_PEAK = { min: 300, max: 1000, step: 50, def: 600 };

export const JL_PRESETS: JlPreset[] = [
  {
    id: "sports-hdr",
    label: "Sports HDR",
    sub: "HDR color for live games without the washed-out or blown-out look: mpv expands standard video to HDR at a brightness you set, RTX Super Resolution sharpens it to 4K, and motion is smoothed to your screen's refresh rate.",
    tweaks: {
      "inverse-tone-mapping": "yes",
      "target-peak": String(SPORTS_HDR_PEAK.def),
      "tone-mapping": "spline",
      saturation: "6",
      deband: "yes",
      interpolation: "yes",
      tscale: "oversample",
      "video-sync": "display-resample",
    },
    player: { playerHdrToSdr: false, playerRtxHdr: false, playerRtxVsr: true },
  },
  {
    id: "vivid-rtx",
    label: "Vivid HDR (NVIDIA)",
    sub: "NVIDIA's RTX Video HDR does the conversion. The brightest, most saturated look; set its strength in the NVIDIA app.",
    tweaks: { deband: "yes", "video-sync": "display-resample" },
    player: { playerHdrToSdr: false, playerRtxHdr: true, playerRtxVsr: true },
  },
  {
    id: "cinema",
    label: "Cinema 4K",
    sub: "True to the source for movies and shows: real HDR stays HDR, standard video stays standard, with the sharpest scaling and RTX Super Resolution.",
    tweaks: {
      scale: "ewa_lanczossharp",
      cscale: "ewa_lanczossharp",
      deband: "yes",
      "video-sync": "display-resample",
    },
    player: { playerHdrToSdr: false, playerRtxHdr: false, playerRtxVsr: true },
  },
  {
    id: "smooth",
    label: "Smooth & stable",
    sub: "When a stream stutters or blacks out: no upscaling or HDR conversion, just steady playback.",
    tweaks: {},
    player: { playerHdrToSdr: true, playerRtxHdr: false, playerRtxVsr: false },
  },
];

/** The mpv tweaks after applying a preset over the viewer's current ones. */
export function applyJlPreset(
  current: Record<string, string>,
  preset: JlPreset,
): Record<string, string> {
  const next = { ...current };
  for (const k of JL_PRESET_KEYS) delete next[k];
  return { ...next, ...preset.tweaks };
}

/** Which preset the current tweaks and toggles match exactly, if any. */
export function activeJlPreset(
  tweaks: Record<string, string>,
  player: JlPreset["player"],
): JlPresetId | null {
  for (const p of JL_PRESETS) {
    const keysMatch = JL_PRESET_KEYS.every((k) => {
      // The brightness slider moves target-peak; at its default it is unset.
      if (p.id === "sports-hdr" && k === "target-peak") return true;
      return (tweaks[k] ?? null) === (p.tweaks[k] ?? null);
    });
    const playerMatch =
      p.player.playerHdrToSdr === player.playerHdrToSdr &&
      p.player.playerRtxHdr === player.playerRtxHdr &&
      p.player.playerRtxVsr === player.playerRtxVsr;
    if (keysMatch && playerMatch) return p.id;
  }
  return null;
}

/** No JL preset keys are set: the player picks Sports HDR or Cinema 4K by what is playing. */
export function jlAutoActive(tweaks: Record<string, string>): boolean {
  return AUTO_GUARD_KEYS.every((k) => tweaks[k] == null || tweaks[k] === "");
}

// Keys only a preset sets. Picture adjustments (sharpen, saturation), the tone-mapping curve
// and the Sports HDR brightness are the viewer's own and tune the automatic setup instead.
const AUTO_GUARD_KEYS = [
  "inverse-tone-mapping",
  "deband",
  "interpolation",
  "tscale",
  "video-sync",
  "scale",
  "cscale",
];

/**
 * The automatic setup for one stream, as mpv.conf lines: Sports HDR for live channels when the
 * player outputs HDR, Cinema 4K for everything else. Nothing when the viewer has picked a
 * preset or set any of its keys themselves, or when the picture is tonemapped to SDR.
 */
export function jlAutoLines(opts: {
  live: boolean;
  hdrOutput: boolean;
  tweaks: Record<string, string>;
}): string {
  if (!jlAutoActive(opts.tweaks)) return "";
  const preset = JL_PRESETS.find(
    (p) => p.id === (opts.live && opts.hdrOutput ? "sports-hdr" : "cinema"),
  )!;
  return Object.entries(preset.tweaks)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

/** Automatic Sports HDR does the SDR-to-HDR conversion itself, so RTX Video HDR stays out of it. */
export function jlAutoUsesMpvHdr(opts: {
  live: boolean;
  hdrOutput: boolean;
  tweaks: Record<string, string>;
}): boolean {
  return jlAutoActive(opts.tweaks) && opts.live && opts.hdrOutput;
}
