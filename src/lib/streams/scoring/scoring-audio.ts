import type { ParsedStream, ScoreReason } from "../types";
import type { PassthroughAudio } from "./scoring-types";

export function audioPoints(s: ParsedStream): ScoreReason {
  if (s.audio.codec === "Atmos") return { signal: "Atmos", delta: 3 };
  if (s.audio.codec === "TrueHD") return { signal: "TrueHD", delta: 2 };
  if (s.audio.codec === "DTS-HD MA") return { signal: "DTS-HD MA", delta: 2 };
  if (s.audio.codec === "DD+") return { signal: "DD+", delta: 1 };
  return { signal: "audio", delta: 0 };
}

export function playabilityPenalty(s: ParsedStream, tvPassthrough?: PassthroughAudio[]): number {
  if (tvPassthrough) return tvPlayabilityPenalty(s, tvPassthrough);
  let penalty = 0;
  if (s.audio.codec === "DTS" || s.audio.codec === "DTS-HD MA") penalty -= 6;
  if (s.audio.codec === "TrueHD") penalty -= 4;
  if (s.container === "mkv" && (s.audio.codec === "DTS" || s.audio.codec === "TrueHD")) penalty -= 3;
  if (s.container === "avi" || s.container === "wmv") penalty -= 8;
  if (s.codec === "AV1") penalty -= 2;
  return penalty;
}

// ExoPlayer has no DTS or TrueHD decoder, so on the TV those tracks play only as passthrough.
// Every other codec plays there, so nothing else is held against a stream.
function tvPlayabilityPenalty(s: ParsedStream, passthrough: PassthroughAudio[]): number {
  let penalty = 0;
  const dts = s.audio.codec === "DTS" || s.audio.codec === "DTS-HD MA";
  if (dts && !passthrough.includes("DTS")) penalty -= 20;
  if (s.audio.codec === "TrueHD" && !passthrough.includes("TrueHD")) penalty -= 20;
  if (s.container === "avi" || s.container === "wmv") penalty -= 8;
  if (s.codec === "AV1") penalty -= 2;
  return penalty;
}
