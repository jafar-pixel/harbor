import { useEffect, useRef } from "react";

/** How long the remote rests on a channel before Your TV switches to it. */
export const REST_TUNE_MS = 900;

/**
 * Exploring with the remote: resting on a channel (or a game's channel) puts it on Your TV, so
 * the pinned screen previews what the viewer is about to pick. Focus only; hovering with a mouse
 * doesn't change the channel.
 */
export function useRestTune(tune: (() => void) | null) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    onFocus: () => {
      window.clearTimeout(timer.current);
      if (tune) timer.current = window.setTimeout(tune, REST_TUNE_MS);
    },
    onBlur: () => window.clearTimeout(timer.current),
  };
}
