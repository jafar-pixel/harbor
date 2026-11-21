import { nativeTvAvailable } from "@/lib/player/native-tv/shell";

/**
 * "Best picture first": on a device whose player plays 4K and HDR (the TV app, up to its
 * max-resolution setting, and the Windows app) the stream to play is the best ready picture,
 * whatever order the add-ons answered in. A browser can't play most 4K files, so it keeps the
 * list's own order. Plain module.
 */
export type BestPicture = false | "auto" | "1080p" | "720p";

const ORDER: Record<Exclude<BestPicture, false>, Record<string, number>> = {
  auto: { "4K": 0, "1080p": 1, "720p": 2, "480p": 3, SD: 4 },
  "1080p": { "1080p": 0, "4K": 1, "720p": 2, "480p": 3, SD: 4 },
  "720p": { "720p": 0, "1080p": 1, "4K": 2, "480p": 3, SD: 4 },
};

/** Lower is better; an unknown resolution comes after every known one. */
export function pictureRank(
  best: Exclude<BestPicture, false>,
  resolution: string | null | undefined,
): number {
  return ORDER[best][resolution ?? ""] ?? 5;
}

/** Among equal resolutions, HDR (Dolby Vision first) beats SDR. */
export function hdrRank(hdr: string | null | undefined): number {
  if (!hdr) return 3;
  if (hdr.startsWith("DV")) return 0;
  if (hdr === "HDR10+") return 1;
  return 2;
}

export function bestPictureFor(tvMaxResolution: "auto" | "1080p" | "720p"): BestPicture {
  if (nativeTvAvailable()) return tvMaxResolution;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) return "auto";
  return false;
}
