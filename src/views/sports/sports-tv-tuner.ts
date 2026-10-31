import { useSyncExternalStore } from "react";
import type { IptvChannel } from "@/lib/iptv/types";

/**
 * What the Sports TV is showing, shared by Hub, Schedules and Replays so moving between them
 * keeps the game on. `channels` are the same broadcast's feeds, best first.
 */
export type SportsTvTuned = {
  key: string;
  title: string;
  subtitle?: string;
  live: boolean;
  channels: IptvChannel[];
};

let tuned: SportsTvTuned | null = null;
const listeners = new Set<() => void>();

export function tuneSportsTv(next: SportsTvTuned | null) {
  tuned = next;
  for (const l of listeners) l();
}

export function useSportsTvTuned(): SportsTvTuned | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => tuned,
  );
}

/**
 * A click puts something on the TV; clicking what's already on it (a double click, or a second
 * OK on a remote) opens it in the full player.
 */
export function tuneOrWatch(next: SportsTvTuned, watch: (channel: IptvChannel) => void) {
  if (tuned?.key === next.key && next.channels[0]) watch(next.channels[0]);
  else tuneSportsTv(next);
}
