import { useSyncExternalStore } from "react";
import type { IptvChannel } from "../../iptv/types";

/** One of today's games for the player's side panel: its score line and the channel it's on. */
export type LiveTodayRow = {
  key: string;
  title: string;
  score: string | null;
  detail: string;
  live: boolean;
  channel: IptvChannel | null;
};

let rows: LiveTodayRow[] = [];
const listeners = new Set<() => void>();

/** The Sports Hub publishes today's games here so the full player can list them with scores. */
export function publishLiveToday(next: LiveTodayRow[]) {
  rows = next;
  for (const l of listeners) l();
}

export function useLiveToday(): LiveTodayRow[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => rows,
  );
}
