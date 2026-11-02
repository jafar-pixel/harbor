import { useEffect, useRef, useState, type RefObject } from "react";
import { headersFromChannel } from "@/lib/iptv/channel-headers";
import type { IptvChannel } from "@/lib/iptv/types";
import { NATIVE_HERO_BAR_PX } from "./bridge";
import { nativeTvAvailable, nativeTvPlayer } from "./shell";

/**
 * The small TV screens (Live TV's Your TV, the Sports TV, the Channels preview) on the Shield.
 * The TV app's own player (ExoPlayer: 4K, HDR, Dolby) plays the channel inside the box, so one
 * press of OK puts it on and it plays. Full screen opens the app's full player, which takes the
 * TV app's player over: the box hands it off instead of stopping it, so the full player's
 * stream isn't cut by the box closing. (Enlarging the box's own stream in place never opened
 * on the Shield.)
 *
 * The box leaves its bottom strip uncovered so the page's own controls (volume, Watch) stay
 * visible and reachable; the video fills the rest of the box. The page's volume drives the
 * player's.
 */

// Only one small screen drives the native player at a time; the last one mounted owns it.
let owner: symbol | null = null;
// The full player is taking the TV app's player over: the box lets go without stopping it.
let handoff = false;
let handoffTimer: ReturnType<typeof setTimeout> | undefined;

function startHandoff(): void {
  handoff = true;
  // If the full player never opens, the box takes its video back.
  clearTimeout(handoffTimer);
  handoffTimer = setTimeout(() => {
    handoff = false;
  }, 5000);
}

/**
 * Hand the small TV over to the full player the caller opens next. Always false: the caller
 * opens the full player (kept for the call sites that ask the box first).
 */
export function requestSmallTvFull(): boolean {
  if (owner) startHandoff();
  return false;
}

export function useNativeSmallTv(
  box: RefObject<HTMLElement | null>,
  channel: IptvChannel | null,
  active: boolean,
  sound: { volume: number; muted: boolean },
): { native: boolean; playing: boolean; fullScreen: () => boolean } {
  const native = nativeTvAvailable();
  const [playing, setPlaying] = useState(false);
  const token = useRef(Symbol("small-tv"));

  useEffect(() => {
    setPlaying(false);
    const p = nativeTvPlayer();
    if (!native || !p || !active || !channel?.url) return;
    const me = token.current;
    owner = me;
    p.play(channel.url, JSON.stringify(headersFromChannel(channel) ?? {}), channel.name, 0);

    let frame = 0;
    const place = () => {
      frame = 0;
      const el = box.current;
      if (!el || owner !== me) return;
      const r = el.getBoundingClientRect();
      const h = r.height - NATIVE_HERO_BAR_PX - 16;
      // Shown while any of the box is on screen: Your TV's box can run past the bottom edge.
      const onScreen = r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && h > 0;
      if (onScreen) p.setRect(r.left, r.top, r.width, h);
      if (handoff) return;
      p.setMode(onScreen ? "hero" : "hidden");
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(place);
    };
    const onNative = (e: Event) => {
      const d = (e as CustomEvent<{ type?: string }>).detail;
      if (owner !== me) return;
      if (d?.type === "playing") setPlaying(true);
      // Back in full screen: the TV app already returns to the box; place it again.
      if (d?.type === "exit-full") schedule();
    };
    place();
    const tick = window.setInterval(schedule, 500);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("jl-native-player", onNative);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(tick);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("jl-native-player", onNative);
      if (owner === me) {
        owner = null;
        // Handing off: the full player's own play replaces this stream; stopping here could
        // cut the full player's stream instead.
        if (handoff) handoff = false;
        else p.stop();
      }
    };
  }, [native, active, channel?.id, channel?.url]);

  const level = sound.muted ? 0 : sound.volume;
  useEffect(() => {
    if (native && active) nativeTvPlayer()?.setVolume?.(level);
  }, [native, active, level, channel?.id]);

  return {
    native,
    playing,
    /** Hands this box over to the full player the caller opens next; always false. */
    fullScreen: () => {
      if (owner === token.current) startHandoff();
      return false;
    },
  };
}
