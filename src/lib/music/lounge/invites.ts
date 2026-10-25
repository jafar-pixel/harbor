import { useEffect, useSyncExternalStore } from "react";
import { jlAccountContext, subscribeJlSession } from "@/lib/jl/account/client";
import { dismissLoungeInvite, myLoungeInvites, type LoungeInvite } from "./api";

/** Lounge invites for the viewer, checked every 30 seconds while the app is visible. */

const POLL_MS = 30_000;
let invites: LoungeInvite[] = [];
const listeners = new Set<() => void>();
let users = 0;
let timer = 0;

function set(next: LoungeInvite[]) {
  invites = next;
  for (const fn of listeners) fn();
}

export async function refreshLoungeInvites(): Promise<void> {
  if (!jlAccountContext()) return set([]);
  try {
    set(await myLoungeInvites());
  } catch {
    // Offline; the next check tries again.
  }
}

/** Drop an invite from the list (joined or declined); declining also removes it for good. */
export function clearLoungeInvite(id: string, decline: boolean): void {
  set(invites.filter((i) => i.lounge_id !== id));
  if (decline) void dismissLoungeInvite(id).catch(() => {});
}

function tick() {
  if (document.visibilityState === "visible") void refreshLoungeInvites();
}

export function useLoungeInvites(): LoungeInvite[] {
  useEffect(() => {
    users += 1;
    if (users === 1) {
      void refreshLoungeInvites();
      timer = window.setInterval(tick, POLL_MS);
      document.addEventListener("visibilitychange", tick);
    }
    const unsubscribe = subscribeJlSession(() => void refreshLoungeInvites());
    return () => {
      unsubscribe();
      users -= 1;
      if (users === 0) {
        window.clearInterval(timer);
        document.removeEventListener("visibilitychange", tick);
      }
    };
  }, []);
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => invites,
    () => invites,
  );
}

/** A lounge invite the Music Hub should open and join (from the toast). */
export const LOUNGE_JOIN_EVENT = "jl-music-join-lounge";
let pendingJoin: string | null = null;
export function requestLoungeJoin(id: string): void {
  pendingJoin = id;
  window.dispatchEvent(new Event(LOUNGE_JOIN_EVENT));
}
export function takeLoungeJoin(): string | null {
  const id = pendingJoin;
  pendingJoin = null;
  return id;
}
