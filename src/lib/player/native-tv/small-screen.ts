import { useEffect, useRef, useState, type RefObject } from "react";
import { headersFromChannel } from "@/lib/iptv/channel-headers";
import type { IptvChannel } from "@/lib/iptv/types";
import { NATIVE_HERO_BAR_PX } from "./bridge";
import { nativeTvAvailable, nativeTvPlayer } from "./shell";

/**
 * The small TV screens (Live TV's Your TV, the Sports TV, the Channels preview) on the Shield.
 * The TV app's own player (ExoPlayer: 4K, HDR, Dolby) plays the channel inside the box, so one
 * press of OK puts it on and it plays. Full screen is the same stream made big, and Back in full
 * screen brings it back to the box: no second connection to the provider.
 *
 * The box leaves its bottom strip uncovered so the page's own controls stay reachable.
 */

const FULL_EVENT = "jl-small-tv-full";
// Only one small screen drives the native player at a time; the last one mounted owns it.
let owner: symbol | null = null;

/** Make the small TV's channel full screen (OK on the channel already on it). */
export function requestSmallTvFull(): void {
  window.dispatchEvent(new Event(FULL_EVENT));
}

export function useNativeSmallTv(
  box: RefObject<HTMLElement | null>,
  channel: IptvChannel | null,
  active: boolean,
): { native: boolean; playing: boolean; fullScreen: () => void } {
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
      const onScreen = r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0 && h > 0;
      if (!onScreen) {
        p.setMode("hidden");
        return;
      }
      p.setRect(r.left, r.top, r.width, h);
      p.setMode("hero");
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
    const onFull = () => {
      if (owner === me) p.setMode("full");
    };
    place();
    const tick = window.setInterval(schedule, 500);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("jl-native-player", onNative);
    window.addEventListener(FULL_EVENT, onFull);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(tick);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("jl-native-player", onNative);
      window.removeEventListener(FULL_EVENT, onFull);
      if (owner === me) {
        owner = null;
        p.stop();
      }
    };
  }, [native, active, channel?.id, channel?.url]);

  return {
    native,
    playing,
    fullScreen: () => {
      if (owner === token.current) nativeTvPlayer()?.setMode("full");
    },
  };
}
