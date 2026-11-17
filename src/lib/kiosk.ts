import { useSyncExternalStore } from "react";
import {
  enterWindowFullscreen,
  exitWindowFullscreen,
  getWindowFullscreen,
  subscribeFullscreen,
} from "./fullscreen-state";
import { isTvApp } from "./platform";

/**
 * Full screen on the website ("kiosk mode"): the app fills the screen with no browser bars, tabs
 * or address bar. Browsers only allow it after a click or key press, so the choice is remembered
 * and the next press anywhere on a later visit takes the app back to full screen. The Windows app
 * and the TV app already fill their screens and don't use this.
 */

const KEY = "jl.web.kiosk.v1";

type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };

function keyboard(): KeyboardLock | undefined {
  return (navigator as unknown as { keyboard?: KeyboardLock }).keyboard;
}

export function kioskSupported(): boolean {
  if (typeof document === "undefined" || "__TAURI_INTERNALS__" in window || isTvApp()) return false;
  return !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
}

function remember(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private browsing: full screen still works, it just isn't remembered */
  }
}

function remembered(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export async function enterKiosk(): Promise<void> {
  if (!kioskSupported()) return;
  remember(true);
  await enterWindowFullscreen();
  // Chrome and Edge: Esc stays in the app (holding Esc still leaves full screen), so a quick Esc
  // closes a menu instead of dropping out of kiosk mode. Other browsers ignore this.
  void keyboard()
    ?.lock?.(["Escape"])
    .catch(() => undefined);
}

export async function exitKiosk(): Promise<void> {
  remember(false);
  keyboard()?.unlock?.();
  await exitWindowFullscreen();
}

export function toggleKiosk(): Promise<void> {
  return getWindowFullscreen() ? exitKiosk() : enterKiosk();
}

export function useKiosk(): boolean {
  return useSyncExternalStore(subscribeFullscreen, getWindowFullscreen, getWindowFullscreen);
}

let armed = false;

/**
 * On a later visit after kiosk mode was on: the first click, tap or key press goes back to full
 * screen (a page can't do it on its own when it opens). Leaving full screen in any way turns the
 * remembered choice off.
 */
export function armKioskResume(): void {
  if (armed || !kioskSupported()) return;
  armed = true;
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && remembered()) {
      remember(false);
      keyboard()?.unlock?.();
    }
  });
  if (!remembered()) return;
  const resume = () => {
    window.removeEventListener("pointerdown", resume, true);
    window.removeEventListener("keydown", resume, true);
    if (remembered() && !document.fullscreenElement) void enterKiosk();
  };
  window.addEventListener("pointerdown", resume, true);
  window.addEventListener("keydown", resume, true);
}
