/**
 * Inside the Android TV app, each key press on a text field is written to the TV's log
 * (`adb logcat -s JLPage`; MainActivity forwards "[keys]" console lines): what kind of key, which
 * field had focus and in what state, and whether anything stopped it. It never records what was
 * typed: letters show as "char". It exists to find why typing on the Shield goes nowhere.
 */

type Trace = (line: string) => void;

function kindOf(e: KeyboardEvent): string {
  if (e.key.length === 1) return "char";
  return e.key || `code${e.keyCode}`;
}

function fieldOf(el: Element | null): string {
  if (!(el instanceof HTMLElement)) return "none";
  const parts = [el.tagName.toLowerCase()];
  if (el instanceof HTMLInputElement) {
    parts.push(el.type);
    if (el.readOnly) parts.push("readonly");
    if (el.disabled) parts.push("disabled");
  }
  if (el.isContentEditable) parts.push("editable");
  if (el.hasAttribute("data-search-nav-mode")) parts.push("nav-mode");
  if (el.hasAttribute("data-search-editing")) parts.push("editing");
  if (el.closest("[data-search-overlay]")) parts.push("overlay");
  return parts.join("/");
}

function isTextish(el: Element | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

/** Installs the trace when this page runs in the TV app; returns how to remove it. */
export function installTvKeyTrace(trace: Trace = (line) => console.info(`[keys] ${line}`)) {
  if (typeof window === "undefined" || !("JLNativePlayer" in window)) return () => {};
  const onKeyEarly = (e: KeyboardEvent) => {
    if (e.key.length !== 1 && e.key !== "Backspace" && e.key !== "Enter") return;
    trace(`down ${kindOf(e)} focus=${fieldOf(document.activeElement)}`);
  };
  const onKeyLate = (e: KeyboardEvent) => {
    if (e.key.length !== 1 && e.key !== "Backspace" && e.key !== "Enter") return;
    trace(
      `down-after ${kindOf(e)} prevented=${e.defaultPrevented} focus=${fieldOf(document.activeElement)}`,
    );
  };
  const onBeforeInputEarly = (e: Event) => {
    trace(
      `beforeinput-start ${(e as InputEvent).inputType} focus=${fieldOf(document.activeElement)}`,
    );
  };
  const onBeforeInputLate = (e: Event) => {
    const ie = e as InputEvent;
    trace(
      `beforeinput ${ie.inputType} prevented=${e.defaultPrevented} focus=${fieldOf(document.activeElement)}`,
    );
  };
  const onInput = (e: Event) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!isTextish(target)) return;
    const length =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        ? target.value.length
        : -1;
    trace(`input length=${length} field=${fieldOf(target)}`);
  };
  const onFocus = (e: FocusEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    if (isTextish(target)) trace(`focus ${fieldOf(target)}`);
  };
  // Capture on window runs before the app's own handlers (installed later); bubble on window runs
  // after them, so "prevented" says whether one of them stopped the key.
  window.addEventListener("keydown", onKeyEarly, true);
  window.addEventListener("keydown", onKeyLate);
  window.addEventListener("beforeinput", onBeforeInputEarly, true);
  window.addEventListener("beforeinput", onBeforeInputLate);
  window.addEventListener("input", onInput, true);
  window.addEventListener("focusin", onFocus, true);
  return () => {
    window.removeEventListener("keydown", onKeyEarly, true);
    window.removeEventListener("keydown", onKeyLate);
    window.removeEventListener("beforeinput", onBeforeInputEarly, true);
    window.removeEventListener("beforeinput", onBeforeInputLate);
    window.removeEventListener("input", onInput, true);
    window.removeEventListener("focusin", onFocus, true);
  };
}
