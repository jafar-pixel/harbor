import { dispatchTvNav } from "@/lib/keyboard-navigation";
import type { RemoteNavKey } from "./protocol";

/** Phone touchpad → host library focus (select/back are imperative; arrows reuse key nav). */
export function injectHostNav(key: RemoteNavKey): void {
  if (typeof window === "undefined") return;
  if (document.documentElement.hasAttribute("data-big-picture")) {
    const keys = {
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
      select: "Enter",
      back: "Escape",
    };
    const code = keys[key];
    const target = document.activeElement ?? document;
    const event = new KeyboardEvent("keydown", {
      key: code,
      code,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    if (key === "select" && !event.defaultPrevented && target instanceof HTMLElement)
      target.click();
    return;
  }
  dispatchTvNav(key);
}
