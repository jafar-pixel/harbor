import { useEffect, useState } from "react";

/**
 * Text that adapts to the room behind the Pro glass window. The backdrop photo is sampled once
 * into a small brightness grid; the part of it behind the sidebar and behind the page is measured
 * separately, and each is marked "light" or "dark" on <html> (data-glass-side, data-glass-main).
 * The theme then shows dark text with a light halo over a bright room, and white text with a dark
 * halo over a dark one.
 *
 * Rooms are rarely even (dark sky above a white floor), so the same grid also makes a shade map:
 * a soft dark layer that is strongest where the room is brightest and absent where it is dark. It
 * sits under the glass window only, so white text reads over bright patches while the rest of the
 * room stays clear.
 */

type Grid = { w: number; h: number; lum: Float32Array; shade: string | null };

const SAMPLE_W = 96;
/** Above this average brightness (0–1, after the window's tint) the room counts as light. */
const LIGHT_AT = 0.52;
/** How much of the room's light gets through the window's tint. */
const THROUGH_TINT = 0.9;

const grids = new Map<string, Promise<Grid | null>>();

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function sample(url: string): Promise<Grid | null> {
  let pending = grids.get(url);
  if (pending) return pending;
  pending = new Promise<Grid | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const w = SAMPLE_W;
        const h = Math.max(1, Math.round((SAMPLE_W * img.naturalHeight) / img.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const lum = new Float32Array(w * h);
        for (let i = 0; i < lum.length; i++) {
          const r = channel(data[i * 4]);
          const g = channel(data[i * 4 + 1]);
          const b = channel(data[i * 4 + 2]);
          // Perceived lightness (L*) from relative luminance, 0–1.
          const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          lum[i] = y <= 0.008856 ? (y * 903.3) / 100 : (116 * Math.cbrt(y) - 16) / 100;
        }
        resolve({ w, h, lum, shade: shadeMap(lum, w, h) });
      } catch {
        // A photo from a host without CORS can't be read; text keeps its default look.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  grids.set(url, pending);
  return pending;
}

/** Brightness at which the shade begins, and its strongest darkening over pure white. */
const SHADE_FROM = 0.45;
const SHADE_MAX = 0.5;

function shadeMap(lum: Float32Array, w: number, h: number): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const out = ctx.createImageData(w, h);
    for (let i = 0; i < lum.length; i++) {
      const a = Math.max(0, Math.min(1, (lum[i] - SHADE_FROM) / (1 - SHADE_FROM))) * SHADE_MAX;
      out.data[i * 4] = 10;
      out.data[i * 4 + 1] = 14;
      out.data[i * 4 + 2] = 24;
      out.data[i * 4 + 3] = Math.round(a * 255);
    }
    ctx.putImageData(out, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** The app's glass window, when the current layout has one. */
const WINDOW_SELECTOR =
  "[data-harbor-native-backdrop]:is(:has(> aside[data-harbor-sidebar]), :has(main[data-live-page]))";

/** Average brightness of the photo under a screen rectangle, with the photo covering the screen. */
function brightnessUnder(grid: Grid, rect: DOMRect, vw: number, vh: number): number {
  // background-size: cover, centred.
  const scale = Math.max(vw / grid.w, vh / grid.h);
  const ox = (vw - grid.w * scale) / 2;
  const oy = (vh - grid.h * scale) / 2;
  const x0 = Math.max(0, Math.floor((rect.left - ox) / scale));
  const x1 = Math.min(grid.w, Math.ceil((rect.right - ox) / scale));
  const y0 = Math.max(0, Math.floor((rect.top - oy) / scale));
  const y1 = Math.min(grid.h, Math.ceil((rect.bottom - oy) / scale));
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      sum += grid.lum[y * grid.w + x];
      n++;
    }
  return n ? sum / n : 0;
}

function clear() {
  const root = document.documentElement;
  delete root.dataset.glassMain;
  delete root.dataset.glassSide;
  delete root.dataset.glassWindow;
}

/**
 * Keep data-glass-main / data-glass-side in step with the room photo and the window's layout.
 * Returns the shade map for the room (a data URL laid over it with background-size: cover), or
 * null.
 */
export function useGlassTone(image: string | null): string | null {
  const [shade, setShade] = useState<string | null>(null);
  useEffect(() => {
    if (!image || /^(linear|radial|conic)-gradient/.test(image)) {
      clear();
      setShade(null);
      return;
    }
    let grid: Grid | null = null;
    let cancelled = false;
    let frame = 0;
    const root = document.documentElement;
    const measure = () => {
      frame = 0;
      if (!grid) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const shell = document.querySelector<HTMLElement>("[data-harbor-native-backdrop]");
      const side = document.querySelector<HTMLElement>("aside[data-harbor-sidebar]");
      const shellRect = shell?.getBoundingClientRect() ?? new DOMRect(0, 0, vw, vh);
      const sideRect = side?.getBoundingClientRect() ?? null;
      const mainRect =
        sideRect && sideRect.width > 0
          ? new DOMRect(
              sideRect.right,
              shellRect.top,
              Math.max(1, shellRect.right - sideRect.right),
              shellRect.height,
            )
          : shellRect;
      const tone = (r: DOMRect) =>
        brightnessUnder(grid!, r, vw, vh) * THROUGH_TINT > LIGHT_AT ? "light" : "dark";
      root.dataset.glassMain = tone(mainRect);
      if (sideRect && sideRect.width > 0) root.dataset.glassSide = tone(sideRect);
      else delete root.dataset.glassSide;
      let windowed = false;
      try {
        windowed = !!shell?.matches(WINDOW_SELECTOR);
      } catch {
        /* no :has() support: no window, no shade */
      }
      if (windowed) root.dataset.glassWindow = "1";
      else delete root.dataset.glassWindow;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    void sample(image).then((g) => {
      if (cancelled) return;
      grid = g;
      setShade(g?.shade ?? null);
      if (g) schedule();
      else clear();
    });
    // The sidebar collapsing, the window resizing or a layout change moves what sits where.
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    const shell = document.querySelector("[data-harbor-native-backdrop]");
    const side = document.querySelector("aside[data-harbor-sidebar]");
    if (shell) observer.observe(shell);
    if (side) observer.observe(side);
    // Pages swap inside the window (Live TV has no sidebar), so watch for that too.
    const mutations = new MutationObserver(schedule);
    if (shell) mutations.observe(shell, { childList: true, subtree: false });
    window.addEventListener("resize", schedule);
    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      clear();
    };
  }, [image]);
  return image ? shade : null;
}
