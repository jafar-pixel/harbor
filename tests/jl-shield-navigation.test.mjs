import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { userAgent: "Android SHIELD JLMediaVisionTV/0.9.39" },
});
globalThis.window = {
  location: { search: "" },
  localStorage: { getItem: () => null },
  innerWidth: 1366,
  innerHeight: 768,
};
const safe = await import("../src/views/big-picture/bp-safe-area.ts");

test("APK safe area defaults and live changes notify the shell, including zero", () => {
  assert.equal(safe.bpOverscan(), 0.02);
  const seen = [];
  const unsubscribe = safe.subscribeBpOverscan(() => seen.push(safe.bpOverscan()));
  safe.setBpOverscan(0.05);
  assert.deepEqual(safe.bpSafeAreaPx(), { x: 68, y: 38 });
  safe.setBpOverscan(0);
  safe.setBpOverscan(0);
  safe.setBpOverscanDefault(0.02);
  assert.deepEqual(seen, [0.05, 0]);
  assert.deepEqual(safe.bpSafeAreaPx(), { x: 0, y: 0 });
  unsubscribe();
  safe.setBpOverscan(1);
  assert.equal(safe.bpOverscan(), 0.1);
  assert.equal(seen.length, 2);
});

const activity = readFileSync(
  "android-tv/app/src/main/java/com/jlstream/mediavision/MainActivity.kt",
  "utf8",
);
const expression = activity.split("val script = ")[1].split("web.evaluateJavascript(script)")[0];
const script = [...expression.matchAll(/"(?:[^"\\]|\\.)*"/g)].map((m) => JSON.parse(m[0])).join("");
function dispatch({
  hidden = false,
  editing = false,
  repeat = false,
  key = "ArrowDown",
  type = "keydown",
  mounted = true,
} = {}) {
  const events = [];
  const active = { tagName: editing ? "INPUT" : "BUTTON", dispatchEvent: (e) => events.push(e) };
  const handled = runInNewContext(
    script.replaceAll("$type", type).replaceAll("$key", key).replaceAll("$repeat", String(repeat)),
    {
      document: { querySelector: () => (mounted ? {} : null), activeElement: active },
      getComputedStyle: () => ({ visibility: hidden ? "hidden" : "visible" }),
      KeyboardEvent: class {
        constructor(type, init) {
          Object.assign(this, { type }, init);
        }
      },
    },
  );
  return { handled, events };
}
test("APK D-pad forwards one bubbling event with hold/release information", () => {
  const result = dispatch({ repeat: true });
  assert.equal(result.handled, true);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].key, "ArrowDown");
  assert.equal(result.events[0].repeat, true);
  assert.equal(result.events[0].bubbles, true);
  assert.equal(dispatch({ key: "Enter", type: "keyup" }).events[0].type, "keyup");
});
test("APK navigation leaves editing, playback and non-TV pages to the native WebView", () => {
  for (const state of [{ editing: true }, { hidden: true }, { mounted: false }]) {
    const result = dispatch(state);
    assert.equal(result.handled, false);
    assert.equal(result.events.length, 0);
  }
});
