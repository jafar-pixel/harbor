import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useActiveHeroDockMode } from "@/lib/hero-dock-layout";
import { useHeroWallpaperTint } from "@/lib/hero-wallpaper";
import { sizeImageUrl } from "@/lib/img-size";
import { isAndroidTv } from "@/lib/platform";
import { useSettings } from "@/lib/settings";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const FADE_MS = 520;
// A slow sample still gets the art on screen; its colour cross-fades in when it lands.
const TINT_WAIT_MS = 900;

type Layer = { id: number; image: string; tint: string | null };
let nextLayerId = 0;

export type HeroWallpaper = {
  on: boolean;
  /** Rendered just before the page's scroll container, which must be positioned to paint over it. */
  backdrop: ReactNode;
  /** Spread on the scroll container: marks it and publishes `--discover-tint` to its sections. */
  pageProps: { "data-hero-wallpaper"?: "on"; style?: CSSProperties };
};

/**
 * A page that wears its hero's art as a wallpaper: the art blurred behind everything and washed
 * in its dominant colour. The backdrop fills the content area (the nearest positioned ancestor),
 * so it stays put while the page scrolls. A video pinned as the wallpaper takes the page instead.
 */
export function useHeroWallpaper(image: string | null | undefined): HeroWallpaper {
  const { settings } = useSettings();
  const dockMode = useActiveHeroDockMode();
  const on = !!image && settings.discoverWallpaper && dockMode !== "wallpaper";
  const tv = isAndroidTv();
  // A small rung upscaled under the blur looks the same as a large one and costs a fraction.
  const small = on && image ? sizeImageUrl(image, tv ? 92 : 300) : null;
  const layers = useWallpaperLayers(small);
  const tint = layers[layers.length - 1]?.tint;
  return {
    on,
    backdrop: on ? <WallpaperLayers layers={layers} tv={tv} /> : null,
    pageProps: on
      ? {
          "data-hero-wallpaper": "on",
          style: tint ? ({ "--discover-tint": tint } as CSSProperties) : undefined,
        }
      : {},
  };
}

function useWallpaperLayers(src: string | null): Layer[] {
  const sample = useHeroWallpaperTint(src);
  const [layers, setLayers] = useState<Layer[]>([]);
  const push = (image: string, tint: string | null) =>
    setLayers((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.image === image && last.tint === tint) return prev;
      return [...prev.slice(-1), { id: nextLayerId++, image, tint }];
    });
  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    if (!src) {
      setLayers([]);
      return;
    }
    if (sample) {
      pushRef.current(src, sample.tint);
      return;
    }
    const timer = window.setTimeout(() => pushRef.current(src, null), TINT_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [src, sample]);

  useEffect(() => {
    if (layers.length < 2) return;
    const timer = window.setTimeout(() => setLayers((prev) => prev.slice(-1)), FADE_MS + 80);
    return () => window.clearTimeout(timer);
  }, [layers]);

  return layers;
}

function WallpaperLayers({ layers, tv }: { layers: Layer[]; tv: boolean }) {
  const reduce = useReducedMotion();
  // A television swaps without the cross-fade: two full-window blurred layers blending is the
  // one frame budget its GPU cannot spare.
  const fade = !reduce && !tv;
  return (
    <div aria-hidden className="jl-wall" data-tv={tv ? "" : undefined}>
      {layers.map((layer) => (
        <div
          key={layer.id}
          className={`jl-wall-layer${fade ? " jl-wall-in" : ""}`}
          style={layer.tint ? ({ "--jl-wall-tint": layer.tint } as CSSProperties) : undefined}
        >
          <img
            src={layer.image}
            alt=""
            draggable={false}
            decoding="async"
            className="jl-wall-img"
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
          />
          <div className="jl-wall-glow" />
        </div>
      ))}
      <div className="jl-wall-veil" />
    </div>
  );
}
