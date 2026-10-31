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
    sub: "HDR color for live games without the washed-out or blown-out look: mpv expands standard video to HDR at a brightness you set, and RTX Super Resolution sharpens it to 4K.",
    tweaks: {
      "inverse-tone-mapping": "yes",
      "target-peak": String(SPORTS_HDR_PEAK.def),
      "tone-mapping": "spline",
      saturation: "6",
      deband: "yes",
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
