import assert from "node:assert/strict";
import test from "node:test";
import { createNativeTvBridge } from "../src/lib/player/native-tv/bridge.ts";

type G = Record<string, unknown>;
const g = globalThis as unknown as G;

/** A minimal page and TV app: enough for the bridge to place the video. */
function fakeTv(under: () => boolean) {
  const modes: string[] = [];
  const dataset: Record<string, string> = {};
  const listeners = new Map<string, (e: Event) => void>();
  let frame: (() => void) | null = null;
  g.document = { documentElement: { dataset } };
  g.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  g.MutationObserver = g.ResizeObserver;
  g.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (fn: () => void) => {
      frame = fn;
      return 1;
    },
    cancelAnimationFrame: () => {},
    addEventListener: (type: string, fn: (e: Event) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    JLNativePlayer: {
      isAvailable: () => true,
      setRect: () => {},
      setMode: (m: string) => modes.push(m),
      canShowUnderPage: under,
    },
  };
  const host = { closest: () => null, getBoundingClientRect: () => ({}) } as unknown as HTMLElement;
  const flush = () => {
    const f = frame;
    frame = null;
    f?.();
  };
  const emit = (type: string) =>
    listeners.get("jl-native-player")?.({ detail: { type } } as unknown as Event);
  return { modes, dataset, host, flush, emit };
}

test("an SDR video moves under the page once its format is known", () => {
  let known = false;
  const tv = fakeTv(() => known);
  const bridge = createNativeTvBridge();
  bridge.attach(tv.host);
  tv.flush();
  assert.equal(tv.modes.at(-1), "full", "on top until the format is known");
  assert.equal(tv.dataset.tvVideoUnder, undefined);
  known = true;
  tv.emit("first-frame");
  tv.flush();
  assert.equal(tv.modes.at(-1), "under");
  assert.equal(tv.dataset.tvVideoUnder, "1", "the page turns see-through over the video");
  bridge.detach();
  assert.equal(tv.dataset.tvVideoUnder, undefined);
});

test("HDR and Dolby Vision always stay on top of the page", () => {
  const tv = fakeTv(() => false);
  const bridge = createNativeTvBridge();
  bridge.attach(tv.host);
  tv.flush();
  tv.emit("tracks");
  tv.flush();
  tv.emit("first-frame");
  tv.flush();
  assert.ok(tv.modes.length > 0);
  assert.ok(tv.modes.every((m) => m === "full"), `never under: ${tv.modes.join(",")}`);
  assert.equal(tv.dataset.tvVideoUnder, undefined);
  bridge.detach();
});

test("an app build that throws keeps the video on top", () => {
  const tv = fakeTv(() => {
    throw new Error("old build");
  });
  const bridge = createNativeTvBridge();
  bridge.attach(tv.host);
  tv.flush();
  assert.equal(tv.modes.at(-1), "full");
  bridge.detach();
  delete g.window;
  delete g.document;
});
