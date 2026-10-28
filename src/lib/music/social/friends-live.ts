import { useCallback, useEffect, useState } from "react";
import { jlFunction } from "@/lib/jl/account/client";

/**
 * Friends, simply (supabase/functions/music-friends): invite by email, and see what accepted
 * friends are playing on which device and who's in a Listening Lounge.
 */

export type FriendPlaying = {
  device_name: string;
  device_kind: "desktop" | "web" | "android";
  title: string;
  artist: string;
  art: string | null;
  video_id: string | null;
  source: string;
  paused: boolean;
  updated_at: string;
};

export type LiveFriend = {
  userId: string;
  name: string;
  playing: FriendPlaying[];
  lounge: { id: string; name: string; hosting: boolean } | null;
};

export type FriendsLive = {
  friends: LiveFriend[];
  requests: { userId: string; name: string }[];
  sent: { userId: string; name: string }[];
};

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await jlFunction("music-friends", {
    method: "POST",
    body: JSON.stringify({ action, ...body }),
  });
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error || `Friends couldn't load (${res.status}).`);
  return out;
}

export type InviteResult = { status: string; link?: string | null };

/** Invite by email: a new person gets an invite email; an existing account a friend request. */
export const inviteFriendByEmail = (email: string) => call<InviteResult>("invite", { email });

/** Join the lounge a friend is in or hosting. */
export const joinFriendLounge = (loungeId: string, name: string) =>
  call<{ loungeId: string }>("join_lounge", { loungeId, name });

const REFRESH_MS = 20_000;

/** Friends and what they're playing, refreshed while the page is open. */
export function useFriendsLive(active: boolean) {
  const [data, setData] = useState<FriendsLive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await call<FriendsLive>("live"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    void reload();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [active, reload]);
  return { data, error, reload };
}
