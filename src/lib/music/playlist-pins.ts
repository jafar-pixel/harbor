import { useSyncExternalStore } from "react";

/** Playlists pinned to the top of the playlist editor, per service, on this device. */

const KEY = "jl.music.playlist-pins.v1";
type Pins = Record<string, string[]>;
const listeners = new Set<() => void>();

function read(): Pins {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Pins;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

let pins = read();

export function togglePin(service: string, id: string) {
  const list = pins[service] ?? [];
  pins = {
    ...pins,
    [service]: list.includes(id) ? list.filter((p) => p !== id) : [id, ...list],
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(pins));
  } catch {
    /* storage blocked: pins last this session */
  }
  for (const fn of listeners) fn();
}

export function usePins(service: string): string[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => pins[service] ?? EMPTY,
    () => EMPTY,
  );
}

const EMPTY: string[] = [];
