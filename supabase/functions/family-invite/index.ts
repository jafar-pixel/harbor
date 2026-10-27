// Family invites by email. The family owner gives an email address and a name: a new person gets
// a JL Media Vision account and an invite email to choose their password; someone who already
// has an account is added to the family straight away. When the email can't be sent, the owner
// gets the invite link to send themselves. Callers must be signed in to JL.
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = Deno.env.get("JL_WEB_URL") || "https://watch.jl-stream.com";
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
  const owner = caller(req);
  if (!owner) return json({ error: "Sign in to your JL Media Vision account." }, 401);
  let body: { email?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!EMAIL_RE.test(email) || email.length > 200)
    return json({ error: "Enter a valid email address." }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const db = admin.schema("media");

  // Someone who already has an account joins the family now.
  const { data: existing } = await db.rpc("user_id_by_email", { p_email: email });
  if (existing) {
    const { data: status, error } = await db.rpc("add_family_member", {
      p_owner: owner,
      p_user: existing,
      p_name: name || email.split("@")[0],
    });
    if (error) return json({ error: "Couldn't add them. Try again." }, 500);
    if (status === "self") return json({ error: "That's your own email address." }, 400);
    if (status === "other-family")
      return json({ error: "That account is already in another family." }, 409);
    return json({ status: status === "already" ? "already" : "added", userId: existing });
  }

  // A new person: create the account and email them an invite to choose a password.
  const options = { redirectTo: APP_URL, data: { name, invited_by: owner } };
  let userId: string | null = null;
  let link: string | null = null;
  const sent = await admin.auth.admin.inviteUserByEmail(email, options);
  if (!sent.error && sent.data.user) {
    userId = sent.data.user.id;
  } else {
    // The email service refused (not set up for this address, or a rate limit): create the
    // account anyway and hand the owner the link to send.
    const made = await admin.auth.admin.generateLink({ type: "invite", email, options });
    if (made.error || !made.data.user) {
      return json({ error: "Couldn't create their account. Try again later." }, 500);
    }
    userId = made.data.user.id;
    link = made.data.properties?.action_link ?? null;
  }
  const { error } = await db.rpc("add_family_member", {
    p_owner: owner,
    p_user: userId,
    p_name: name || email.split("@")[0],
  });
  if (error) return json({ error: "Their account was created but couldn't join. Try again." }, 500);
  return json({ status: link ? "link" : "emailed", userId, link });
});
