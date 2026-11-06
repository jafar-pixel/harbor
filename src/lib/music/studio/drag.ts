import type { DragEvent } from "react";
import type { VideoSong } from "./video-decks";

/**
 * Dragging a song from DJ Studio's library onto a deck. Audio decks take a crate song (or a
 * Jellyfin song, added to the crate on drop); video decks take a YouTube Music song.
 */
export type StudioDrag =
  | { kind: "crate"; id: string }
  | { kind: "url"; url: string; title: string; artist: string; art: string | null }
  | { kind: "video"; song: VideoSong };

export const STUDIO_DRAG_TYPE = "application/x-jl-studio-song";

export function startStudioDrag(e: DragEvent, item: StudioDrag): void {
  e.dataTransfer.setData(STUDIO_DRAG_TYPE, JSON.stringify(item));
  e.dataTransfer.effectAllowed = "copy";
}

/** True while a studio song is dragged over (its contents can only be read on drop). */
export function isStudioDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(STUDIO_DRAG_TYPE);
}

export function readStudioDrag(e: DragEvent): StudioDrag | null {
  try {
    const raw: unknown = JSON.parse(e.dataTransfer.getData(STUDIO_DRAG_TYPE));
    if (!raw || typeof raw !== "object") return null;
    const v = raw as Record<string, unknown>;
    if (v.kind === "crate" && typeof v.id === "string") return { kind: "crate", id: v.id };
    if (v.kind === "url" && typeof v.url === "string" && typeof v.title === "string")
      return {
        kind: "url",
        url: v.url,
        title: v.title,
        artist: typeof v.artist === "string" ? v.artist : "",
        art: typeof v.art === "string" ? v.art : null,
      };
    const song = v.song as Record<string, unknown> | undefined;
    if (v.kind === "video" && song && /^[A-Za-z0-9_-]{11}$/.test(String(song.videoId)))
      return {
        kind: "video",
        song: {
          videoId: String(song.videoId),
          title: String(song.title ?? ""),
          artist: String(song.artist ?? ""),
          art: typeof song.art === "string" ? song.art : null,
          bpm: typeof song.bpm === "number" ? song.bpm : undefined,
          key: typeof song.key === "string" ? song.key : undefined,
        },
      };
    return null;
  } catch {
    return null;
  }
}
