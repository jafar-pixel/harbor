import { useSyncExternalStore } from "react";
import type { SportsGame } from "./espn-types";

/** The Sports Hub's games as last loaded (for its search), and whether the search is open. */
let games: SportsGame[] = [];
let open = false;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function publishHubGames(next: SportsGame[]): void {
  games = next;
}

export function hubGames(): SportsGame[] {
  return games;
}

export function setSportsSearchOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  notify();
}

export function useSportsSearchOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}
