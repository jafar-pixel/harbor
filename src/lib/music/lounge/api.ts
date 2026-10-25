import { jlAccountContext, jlRest, jlRpc } from "@/lib/jl/account/client";

/**
 * Listening Lounges on the JL account (supabase/jl-vision/0007). The host writes what's on;
 * members read it. The database decides who can see a lounge (host, members, invitees) and who
 * can change it (the host).
 */

export type Lounge = {
  id: string;
  host: string;
  name: string;
  vibe: string | null;
  code: string;
  now_video_id: string | null;
  now_artist: string | null;
  now_title: string | null;
  started_at: string | null;
  paused_at: string | null;
  ended: boolean;
};
export type LoungeMember = { user_id: string; display_name: string; last_seen: string };
export type LoungeEvent = {
  id: number;
  user_id: string;
  display_name: string;
  kind: "reaction" | "request" | "chat";
  body: string;
  created_at: string;
};
export type LoungeInvite = {
  lounge_id: string;
  name: string;
  vibe: string | null;
  host_name: string;
  created_at: string;
};
export type NowPlaying = {
  videoId: string | null;
  artist: string | null;
  title: string | null;
  startedAt: number | null;
  pausedAt: number | null;
};

const LOUNGE_COLUMNS =
  "id,host,name,vibe,code,now_video_id,now_artist,now_title,started_at,paused_at,ended";

export function me(): string {
  const ctx = jlAccountContext();
  if (!ctx) throw new Error("Sign in to your JL Media Vision account first.");
  return ctx.userId;
}

async function ok(res: Response): Promise<Response> {
  if (res.ok) return res;
  const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
  if (body.code === "P0002") throw new Error("No open lounge with that code.");
  throw new Error(body.message || `Request failed (${res.status}).`);
}

/** Open a lounge you host. */
export async function createLounge(name: string, vibe: string | null): Promise<Lounge> {
  me();
  const res = await ok(
    await jlRest(`lounges?select=${LOUNGE_COLUMNS}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: name.trim().slice(0, 80), vibe: vibe?.slice(0, 200) ?? null }),
    }),
  );
  const rows = (await res.json()) as Lounge[];
  if (!rows[0]) throw new Error("The lounge couldn't be opened.");
  return rows[0];
}

/** Join by the 6-character code, or by lounge id when invited. Returns the lounge id. */
export async function joinLounge(codeOrId: string, displayName: string): Promise<string> {
  me();
  const res = await ok(
    await jlRest("rpc/join_lounge", {
      method: "POST",
      body: JSON.stringify({ p_code: codeOrId.trim(), p_name: displayName.trim().slice(0, 40) }),
    }),
  );
  return (await res.json()) as string;
}

export async function getLounge(id: string): Promise<Lounge | null> {
  const res = await ok(
    await jlRest(`lounges?select=${LOUNGE_COLUMNS}&id=eq.${encodeURIComponent(id)}`),
  );
  return ((await res.json()) as Lounge[])[0] ?? null;
}

/** Lounges you host that are still open, newest first (to pick up after a restart). */
export async function myOpenLounges(): Promise<Lounge[]> {
  const res = await ok(
    await jlRest(
      `lounges?select=${LOUNGE_COLUMNS}&host=eq.${encodeURIComponent(me())}&ended=is.false&order=created_at.desc&limit=5`,
    ),
  );
  return (await res.json()) as Lounge[];
}

/** The host's update of what's on. */
export async function setNowPlaying(id: string, now: NowPlaying): Promise<void> {
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  await ok(
    await jlRest(`lounges?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        now_video_id: now.videoId,
        now_artist: now.artist?.slice(0, 80) ?? null,
        now_title: now.title?.slice(0, 120) ?? null,
        started_at: iso(now.startedAt),
        paused_at: iso(now.pausedAt),
        updated_at: new Date().toISOString(),
      }),
    }),
  );
}

export async function endLounge(id: string): Promise<void> {
  await ok(
    await jlRest(`lounges?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ ended: true, updated_at: new Date().toISOString() }),
    }),
  );
}

export async function leaveLounge(id: string): Promise<void> {
  await ok(
    await jlRest(
      `lounge_members?lounge_id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(me())}`,
      { method: "DELETE" },
    ),
  );
}

export async function listMembers(id: string): Promise<LoungeMember[]> {
  const res = await ok(
    await jlRest(
      `lounge_members?select=user_id,display_name,last_seen&lounge_id=eq.${encodeURIComponent(id)}&order=joined_at`,
    ),
  );
  return (await res.json()) as LoungeMember[];
}

export async function markSeen(id: string): Promise<void> {
  await jlRest(
    `lounge_members?lounge_id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(me())}`,
    { method: "PATCH", body: JSON.stringify({ last_seen: new Date().toISOString() }) },
  );
}

/** Events after `afterId`, oldest first; the first read takes the last 30. */
export async function listEvents(id: string, afterId: number | null): Promise<LoungeEvent[]> {
  const base = `lounge_events?select=id,user_id,display_name,kind,body,created_at&lounge_id=eq.${encodeURIComponent(id)}`;
  const res = await ok(
    await jlRest(
      afterId === null ? `${base}&order=id.desc&limit=30` : `${base}&id=gt.${afterId}&order=id`,
    ),
  );
  const rows = (await res.json()) as LoungeEvent[];
  return afterId === null ? rows.reverse() : rows;
}

export async function postEvent(
  id: string,
  displayName: string,
  kind: LoungeEvent["kind"],
  body: string,
): Promise<void> {
  const text = body.trim().slice(0, 200);
  if (!text) return;
  await ok(
    await jlRest("lounge_events", {
      method: "POST",
      body: JSON.stringify({
        lounge_id: id,
        user_id: me(),
        display_name: displayName.trim().slice(0, 40) || "Guest",
        kind,
        body: text,
      }),
    }),
  );
}

export async function inviteToLounge(id: string, friends: string[]): Promise<void> {
  me();
  if (!friends.length) return;
  await ok(
    await jlRest("lounge_invites", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(friends.map((invitee) => ({ lounge_id: id, invitee }))),
    }),
  );
}

export function myLoungeInvites(): Promise<LoungeInvite[]> {
  me();
  return jlRpc<LoungeInvite[]>("my_lounge_invites").then((rows) => rows ?? []);
}

export async function dismissLoungeInvite(id: string): Promise<void> {
  await ok(
    await jlRest(
      `lounge_invites?lounge_id=eq.${encodeURIComponent(id)}&invitee=eq.${encodeURIComponent(me())}`,
      { method: "DELETE" },
    ),
  );
}

/** The server's clock in ms. */
export async function serverNow(): Promise<number> {
  return Date.parse(await jlRpc<string>("lounge_now"));
}
