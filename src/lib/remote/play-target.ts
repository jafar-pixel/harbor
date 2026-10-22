/** Where the phone app's Play goes: the phone's own player, or the connected computer. */
export type PlayTarget = "phone" | "host";

/**
 * A phone plays titles itself. Only the explicit remote route (/remote, or the
 * ?remote=1 link a desktop's pairing QR opens) sends Play to the computer, and
 * only while it is connected and the user has not picked this phone instead.
 */
export function resolvePlayTarget(state: {
  remoteMode: boolean;
  connected: boolean;
  preferPhone: boolean;
  selectedHost?: boolean;
}): PlayTarget {
  return state.remoteMode && (state.connected || state.selectedHost) && !state.preferPhone
    ? "host"
    : "phone";
}

const PHONE_PLAYBACK_KINDS = new Set(["picker", "player"]);
// Frames that close the phone's playback overlay and leave the detail page showing.
const PHONE_RETURN_KINDS = new Set(["home", "meta"]);

/**
 * The phone shell draws only the picker and player from the shared view stack.
 * A page opened from inside them (settings, addons, live TV) has nowhere to
 * render, so the phone steps back instead of closing playback onto nothing.
 */
export function phoneCannotShow(from: string, to: string): boolean {
  return (
    PHONE_PLAYBACK_KINDS.has(from) && !PHONE_PLAYBACK_KINDS.has(to) && !PHONE_RETURN_KINDS.has(to)
  );
}
