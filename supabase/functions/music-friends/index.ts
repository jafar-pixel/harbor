// Music friends, simply: invite someone by email, and see what your friends are playing on
// their devices and who's chilling in a Listening Lounge. Someone new gets a JL Media Vision
// account and an invite email (or the inviter gets the link to send); someone who already has
// an account gets a friend request. Only accepted friends see each other's listening.
// Callers must be signed in to JL.
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = Deno.env.get("JL_WEB_URL") || "https://watch.jl-stream.com";
const FRESH_MS = 3 * 60_000;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** The platform has verified the token's signature; the caller is its subject. */
function caller(req: Request): string | null {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
    return claims.role === "authenticated" && typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const me = caller(req);
  if (!me) return json({ error: "Sign in to your JL Media Vision account." }, 401);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const db = admin.schema("media");
  const action = String(body.action ?? "");

  /** Display names: music handle, else the start of the email. */
  async function names(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!ids.length) return out;
    const { data } = await db
      .from("music_handles")
      .select("user_id, display_name")
      .in("user_id", ids);
    for (const h of data ?? []) out.set(h.user_id, h.display_name);
    for (const id of ids.filter((i) => !out.has(i))) {
      const { data: u } = await admin.auth.admin.getUserById(id);
      const meta = (u?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        (typeof meta.name === "string" && meta.name) ||
        (u?.user?.email ? u.user.email.split("@")[0] : "Friend");
      out.set(id, String(name).slice(0, 40));
    }
    return out;
  }

  async function befriend(other: string, accepted: boolean): Promise<string> {
    if (other === me) return "self";
    const { data: rows } = await db
      .from("music_friends")
      .select("requester, addressee, status")
      .or(
        `and(requester.eq.${me},addressee.eq.${other}),and(requester.eq.${other},addressee.eq.${me})`,
      );
    const row = rows?.[0];
    if (row?.status === "accepted") return "already";
    if (row && row.requester === other) {
      // They asked first: inviting them back accepts.
      await db
        .from("music_friends")
        .update({ status: "accepted" })
        .eq("requester", other)
        .eq("addressee", me);
      return "accepted";
    }
    if (row) return "requested";
    const { error } = await db
      .from("music_friends")
      .insert({ requester: me, addressee: other, status: accepted ? "accepted" : "pending" });
    if (error) throw new Error(error.message);
    return accepted ? "accepted" : "requested";
  }

  try {
    if (action === "invite") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!EMAIL_RE.test(email) || email.length > 200)
        return json({ error: "Enter a valid email address." }, 400);
      const { data: existing } = await db.rpc("user_id_by_email", { p_email: email });
      if (existing) {
        const status = await befriend(existing as string, false);
        if (status === "self") return json({ error: "That's your own email address." }, 400);
        return json({ status });
      }
      // Someone new: an account and an invite email; joining from it makes you friends.
      const inviter = (await names([me])).get(me) ?? "A friend";
      const options = {
        redirectTo: `${APP_URL}/?tab=friends`,
        data: { invited_by: me, invited_by_name: inviter, invite: "music-friend" },
      };
      let userId: string | null = null;
      let link: string | null = null;
      const sent = await admin.auth.admin.inviteUserByEmail(email, options);
      if (!sent.error && sent.data.user) userId = sent.data.user.id;
      else {
        const made = await admin.auth.admin.generateLink({ type: "invite", email, options });
        if (made.error || !made.data.user)
          return json({ error: "Couldn't send the invite. Try again later." }, 500);
        userId = made.data.user.id;
        link = made.data.properties?.action_link ?? null;
      }
      await befriend(userId, true);
      return json({ status: link ? "link" : "emailed", link });
    }

    if (action === "live") {
      const { data: rows, error } = await db
        .from("music_friends")
        .select("requester, addressee, status")
        .or(`requester.eq.${me},addressee.eq.${me}`);
      if (error) throw new Error(error.message);
      const friends = (rows ?? []).filter((r) => r.status === "accepted");
      const pending = (rows ?? []).filter((r) => r.status === "pending" && r.addressee === me);
      const sent = (rows ?? []).filter((r) => r.status === "pending" && r.requester === me);
      const friendIds = friends.map((r) => (r.requester === me ? r.addressee : r.requester));
      const all = [
        ...friendIds,
        ...pending.map((r) => r.requester),
        ...sent.map((r) => r.addressee),
      ];
      const who = await names([...new Set(all)]);
      const since = new Date(Date.now() - FRESH_MS).toISOString();
      const [playing, members] = friendIds.length
        ? await Promise.all([
            db
              .from("now_playing")
              .select(
                "user_id, device_name, device_kind, title, artist, art, video_id, source, paused, updated_at",
              )
              .in("user_id", friendIds)
              .gt("updated_at", since)
              .order("updated_at", { ascending: false }),
            db
              .from("lounge_members")
              .select("user_id, lounge_id, last_seen, lounges!inner(id, name, ended, host)")
              .in("user_id", friendIds)
              .gt("last_seen", since)
              .eq("lounges.ended", false),
          ])
        : [{ data: [] }, { data: [] }];
      return json({
        friends: friendIds.map((id) => ({
          userId: id,
          name: who.get(id) ?? "Friend",
          playing: (playing.data ?? []).filter((p) => p.user_id === id),
          lounge:
            ((members.data ?? []) as Record<string, unknown>[])
              .filter((m) => m.user_id === id)
              .map((m) => {
                const l = m.lounges as { id: string; name: string; host: string };
                return { id: l.id, name: l.name, hosting: l.host === id };
              })[0] ?? null,
        })),
        requests: pending.map((r) => ({
          userId: r.requester,
          name: who.get(r.requester) ?? "Someone",
        })),
        sent: sent.map((r) => ({ userId: r.addressee, name: who.get(r.addressee) ?? "Someone" })),
      });
    }

    if (action === "join_lounge") {
      // Join a friend's lounge straight from Friends (the host must be your friend).
      const loungeId = typeof body.loungeId === "string" ? body.loungeId : "";
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
      const { data: lounge } = await db
        .from("lounges")
        .select("id, host, ended")
        .eq("id", loungeId)
        .maybeSingle();
      if (!lounge || lounge.ended) return json({ error: "That lounge has closed." }, 404);
      const { data: ok } = await db.rpc("are_music_friends", { a: me, b: lounge.host });
      if (!ok && lounge.host !== me)
        return json({ error: "Only friends of the host can join." }, 403);
      const { error } = await db
        .from("lounge_members")
        .upsert(
          {
            lounge_id: lounge.id,
            user_id: me,
            display_name: name || "Guest",
            last_seen: new Date().toISOString(),
          },
          { onConflict: "lounge_id,user_id" },
        );
      if (error) throw new Error(error.message);
      return json({ loungeId: lounge.id });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});
