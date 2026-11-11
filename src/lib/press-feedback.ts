/**
 * A pressed look for the remote's OK (and Enter or Space on a keyboard). Browsers only show
 * :active for a mouse or touch press, so a remote's OK on a button landed without any sign. The
 * focused button gets `data-pressed` for a moment; index.css brightens it, and components that
 * shrink on :active also shrink on `data-[pressed]`.
 */

const PRESS_MS = 140;
const PRESSABLE = 'button, [role="button"], [role="tab"], a[href], summary';

export function installPressFeedback(): () => void {
  if (typeof window === "undefined") return () => {};
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || (e.key !== "Enter" && e.key !== " ")) return;
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !el.matches(PRESSABLE)) return;
    el.setAttribute("data-pressed", "");
    window.setTimeout(() => el.removeAttribute("data-pressed"), PRESS_MS);
  };
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
