import { useSyncExternalStore } from "react";
import type { IptvChannel } from "@/lib/iptv/types";

/**
 * The other channels found for the game being watched, best first, so the player can switch to
 * another feed of the same game in one press when the first one fails or looks poor.
 */
export type GameFeeds = { label: string; channels: IptvChannel[] };

let feeds: GameFeeds | null = null;
const listeners = new Set<() => void>();

export function setGameFeeds(label: string, channels: readonly IptvChannel[]): void {
  feeds = channels.length > 1 ? { label, channels: [...channels] } : null;
  for (const l of listeners) l();
}

export function useGameFeeds(): GameFeeds | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => feeds,
  );
}
