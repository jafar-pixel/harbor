import { jlAccountContext, jlRest, jlRpc } from "@/lib/jl/account/client";

/**
 * Music friends and shared songs on the JL account (supabase/jl-vision/0006). The database
 * decides who sees what: friendships are visible to the two people in them, and songs can only
 * be sent between friends.
 */

export type MusicHandle = { handle: string; display_name: string };
export type MusicFriend = {
  user_id: string;
  handle: string;
  display_name: string;
  status: "pending" | "accepted";
  /** True when the other person asked, so the viewer can accept. */
  incoming: boolean;
};
export type SharedSong = {
  id: string;
  sender: string;
  sender_name: string;
  artist: string;
  title: string;
  video_id: string | null;
  note: string | null;
  created_at: string;
  read_at: string | null;
};
export type SongToShare = { artist: string; title: string; videoId?: string | null };

export const HANDLE = /^[a-z0-9_]{3,24}$/;

function me(): string {
  const ctx = jlAccountContext();
  if (!ctx) throw new Error("Sign in to your JL Media Vision account first.");
  return ctx.userId;
}

async function ok(res: Response): Promise<Response> {
  if (res.ok) return res;
  const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
  if (body.code === "23505") throw new Error("That handle is taken. Try another.");
  throw new Error(body.message || `Request failed (${res.status}).`);
}

/** The viewer's handle, or null before they pick one. */
export async function getMyHandle(): Promise<MusicHandle | null> {
  const id = me();
  const res = await ok(
    await jlRest(`music_handles?select=handle,display_name&user_id=eq.${encodeURIComponent(id)}`),
  );
  const rows = (await res.json()) as MusicHandle[];
  return rows[0] ?? null;
}

/** Pick or change the handle friends find you by, and the name they see. */
export async function setMyHandle(handle: string, displayName: string): Promise<MusicHandle> {
  const id = me();
  const clean = {
    handle: handle.trim().toLowerCase(),
    display_name: displayName.trim().slice(0, 40),
  };
  if (!HANDLE.test(clean.handle))
    throw new Error("Handles are 3–24 letters, numbers or underscores.");
  if (!clean.display_name) throw new Error("Add the name friends will see.");
  const patch = await ok(
    await jlRest(`music_handles?user_id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(clean),
    }),
  );
  const updated = (await patch.json()) as MusicHandle[];
  if (updated[0]) return updated[0];
  await ok(
    await jlRest("music_handles", {
      method: "POST",
      body: JSON.stringify({ user_id: id, ...clean }),
    }),
  );
  return clean;
}

export function listFriends(): Promise<MusicFriend[]> {
  me();
  return jlRpc<MusicFriend[]>("my_music_friends").then((rows) => rows ?? []);
}

/** "requested", or "accepted" when they had already asked you. */
export async function requestFriend(handle: string): Promise<"requested" | "accepted"> {
  me();
  const res = await jlRest("rpc/request_music_friend", {
    method: "POST",
    body: JSON.stringify({ p_handle: handle.trim().toLowerCase() }),
  });
  await ok(res);
  return (await res.json()) as "requested" | "accepted";
}

export async function acceptFriend(userId: string): Promise<void> {
  const id = me();
  await ok(
    await jlRest(
      `music_friends?requester=eq.${encodeURIComponent(userId)}&addressee=eq.${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify({ status: "accepted" }) },
    ),
  );
}

/** Decline a request, cancel yours, or remove a friend. */
export async function removeFriend(userId: string): Promise<void> {
  const id = me();
  const a = encodeURIComponent(id);
  const b = encodeURIComponent(userId);
  await ok(
    await jlRest(
      `music_friends?or=(and(requester.eq.${a},addressee.eq.${b}),and(requester.eq.${b},addressee.eq.${a}))`,
      { method: "DELETE" },
    ),
  );
}

/** Send a song to one or more friends, with an optional note. */
export async function sendSong(
  recipients: string[],
  song: SongToShare,
  note: string,
): Promise<void> {
  const id = me();
  if (!recipients.length) return;
  const videoId = song.videoId && /^[A-Za-z0-9_-]{11}$/.test(song.videoId) ? song.videoId : null;
  await ok(
    await jlRest("song_shares", {
      method: "POST",
      body: JSON.stringify(
        recipients.map((recipient) => ({
          sender: id,
          recipient,
          artist: song.artist.slice(0, 80),
          title: song.title.slice(0, 120),
          video_id: videoId,
          note: note.trim().slice(0, 280) || null,
        })),
      ),
    }),
  );
}

export function songInbox(limit = 50): Promise<SharedSong[]> {
  me();
  return jlRpc<SharedSong[]>("my_song_inbox", { p_limit: limit }).then((rows) => rows ?? []);
}

export async function markSongsRead(ids: string[]): Promise<void> {
  me();
  if (!ids.length) return;
  await ok(
    await jlRest(`song_shares?id=in.(${ids.map(encodeURIComponent).join(",")})`, {
      method: "PATCH",
      body: JSON.stringify({ read_at: new Date().toISOString() }),
    }),
  );
}

export async function deleteSharedSong(id: string): Promise<void> {
  me();
  await ok(await jlRest(`song_shares?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }));
}
