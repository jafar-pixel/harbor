import { useEffect, useRef } from "react";
import { TV_CONTROL_EVENT } from "@/lib/player/native-tv/bridge";

const REMOTE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"]);

/**
 * The TV app with the video under the page: the remote runs the app's own player bar. Any arrow
 * or OK brings the bar up with Play focused (OK on a hidden bar presses nothing); with the bar
 * up, the arrows move between its buttons (the app's TV navigation) and OK presses them. Down
 * from the bar's bottom row, where there is nothing below, opens "Games on now", as the TV
 * app's own bar did.
 */
export function useTvRemoteChrome(params: {
  enabled: boolean;
  chromeVisible: boolean;
  wakeChrome: () => void;
}) {
  const { enabled, chromeVisible, wakeChrome } = params;
  const visibleRef = useRef(chromeVisible);
  visibleRef.current = chromeVisible;
  const wakeRef = useRef(wakeChrome);
  wakeRef.current = wakeChrome;
  /** The element the remote was on after the last key, to tell when Down moved nowhere. */
  const lastFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const root = document.documentElement;
      // Only while the video is full screen under the page; lists over it keep their own focus.
      if (
        root.dataset.tvVideoUnder !== "1" ||
        root.dataset.tvPanel === "1" ||
        root.dataset.tvGames === "1"
      )
        return;
      if (!REMOTE_KEYS.has(e.key)) return;
      const wasVisible = visibleRef.current;
      wakeRef.current();
      const player = document.querySelector<HTMLElement>("[data-harbor-player]");
      const active = document.activeElement;
      const inBar = !!player && active instanceof HTMLElement && player.contains(active);
      if (!wasVisible) {
        // The first press only brings the bar up: it must not press or seek anything unseen.
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      // The app's TV navigation has already handled this key; focus that didn't move on Down
      // means the remote is on the bottom row.
      if (wasVisible && inBar && e.key === "ArrowDown" && active === lastFocus.current) {
        window.dispatchEvent(new CustomEvent(TV_CONTROL_EVENT, { detail: "today-games" }));
      }
      if (!wasVisible || !inBar) {
        window.requestAnimationFrame(() => {
          player?.querySelector<HTMLElement>("[data-player-play-pause]")?.focus();
          lastFocus.current = document.activeElement;
        });
      } else {
        lastFocus.current = active;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}
