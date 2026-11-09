import { badgeText, streamBadges, type BadgeKind } from "@/components/format-badge";
import {
  readPlayerChromeConfig,
  type PlayerChromeConfig,
  type PlayerControlId,
  type PlayerSlot,
} from "@/lib/player-chrome";
import { parseStream } from "@/lib/streams/parser/parser-stream";

/**
 * The viewer's player layout (Settings › Player layout) and the playing stream's labels, for the
 * TV app's full-screen bar, which the TV app draws itself so HDR and Dolby Vision keep their
 * colour (see android-tv/README.md). It shows the controls it can carry out, in the viewer's order.
 */

/** Controls the TV app's bar can carry out (NativePlayer.buttonFor); the rest are left out. */
export const TV_CONTROLS: ReadonlySet<PlayerControlId> = new Set<PlayerControlId>([
  "pick-another",
  "audio-menu",
  "subtitle-menu",
  "speed-menu",
  "aspect-menu",
  "english-dub",
  "song-id",
  "prev-episode",
  "next-episode",
  "stop",
  "back",
]);

const SLOT_ORDER: readonly PlayerSlot[] = [
  "top-left",
  "top-right",
  "seek-leading",
  "seek-trailing",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

/** The visible controls the TV can do, in the layout's order (slot by slot, then within a slot). */
export function tvControls(config: PlayerChromeConfig): string[] {
  return config.controls
    .filter((c) => !c.hidden && TV_CONTROLS.has(c.id))
    .slice()
    .sort(
      (a, b) =>
        SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || (a.order ?? 0) - (b.order ?? 0),
    )
    .map((c) => c.id);
}

/** Badges that say nothing about the file. */
const SKIP: ReadonlySet<string> = new Set(["no-label", "unknown"]);

/** "Hope · 4K UHD · HDR10 · DTS-HD MA" from the title and the stream's release name. */
export function tvInfoLine(title: string, streamName: string | null | undefined): string {
  const labels: string[] = [];
  if (streamName) {
    try {
      const kinds = streamBadges(parseStream({ name: "", title: streamName, addonId: "", addonName: "" }));
      for (const kind of kinds as BadgeKind[]) if (!SKIP.has(kind)) labels.push(badgeText(kind));
    } catch {
      /* An unreadable name shows the title alone. */
    }
  }
  return [title, ...labels].filter(Boolean).join(" · ");
}

/** The layout for the theme the viewer plays with ("stremio" is the Classic style). */
export function tvLayout(theme: "default" | "stremio"): string[] {
  return tvControls(readPlayerChromeConfig(theme));
}
