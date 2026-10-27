// Music sign ins kept with the JL account. A device finishes the YouTube or Spotify sign in here
// once; the refresh token is stored encrypted (media.music_links) and every device signed in to
// the same account asks this function for short-lived access tokens. Refresh tokens never go
// back to a device. Callers must be signed in to JL.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SPOTIFY_CLIENT_ID =
  Deno.env.get("JL_SPOTIFY_CLIENT_ID") || "739d5262cbb44453ba1f933230eef197";
const GOOGLE_CLIENT_ID =
  Deno.env.get("JL_GOOGLE_CLIENT_ID") ||
  "920687425489-gkb74r1s7o7tg7ubl8fdpkq578jlu2dq.apps.googleusercontent.com";
// Google only issues refresh tokens to a confidential client; until this secret is set, YouTube
// falls back to the hour-long browser sign in.
const GOOGLE_CLIENT_SECRET = Deno.env.get("JL_GOOGLE_CLIENT_SECRET") || "";

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

type Provider = "spotify" | "youtube";
type Grant = { access: string; refresh: string; expiresIn: number; scope: string };

class Relink extends Error {}

async function tokenCall(provider: Provider, body: Record<string, string>): Promise<Grant> {
  const url =
    provider === "spotify"
      ? "https://accounts.spotify.com/api/token"
      : "https://oauth2.googleapis.com/token";
  const params =
    provider === "spotify"
      ? { client_id: SPOTIFY_CLIENT_ID, ...body }
      : { client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, ...body };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof out.access_token !== "string") {
    if (out.error === "invalid_grant") throw new Relink("The sign in was revoked.");
    throw new Error(String(out.error_description || out.error || `Sign in failed (${res.status})`));
  }
  return {
    access: out.access_token,
    refresh: typeof out.refresh_token === "string" ? out.refresh_token : "",
    expiresIn: typeof out.expires_in === "number" ? out.expires_in : 3600,
    scope: typeof out.scope === "string" ? out.scope : "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const owner = caller(req);
  if (!owner) return json({ error: "Sign in to your JL Media Vision account." }, 401);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = String(body.action ?? "");
  const provider =
    body.provider === "spotify" || body.provider === "youtube" ? body.provider : null;
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  ).schema("media");

  async function save(p: Provider, refresh: string, g: Grant | null, scope: string) {
    const { error } = await db.rpc("music_link_write", {
      p_owner: owner,
      p_provider: p,
      p_refresh: refresh,
      p_access: g?.access ?? null,
      p_expires: g ? new Date(Date.now() + g.expiresIn * 1000).toISOString() : null,
      p_scope: scope,
    });
    if (error) throw new Error(error.message);
  }
  const granted = (g: Grant, scope: string) =>
    json({ access: g.access, expiresIn: g.expiresIn, scope });

  try {
    if (action === "status") {
      const { data, error } = await db
        .from("music_links")
        .select("provider, scope, updated_at")
        .eq("owner", owner);
      if (error) throw new Error(error.message);
      return json({ links: data ?? [], youtubeServer: !!GOOGLE_CLIENT_SECRET });
    }
    if (!provider) return json({ error: "Unknown service." }, 400);

    if (action === "exchange") {
      if (provider === "youtube" && !GOOGLE_CLIENT_SECRET)
        return json({ error: "not_configured" }, 501);
      const g = await tokenCall(
        provider,
        provider === "spotify"
          ? {
              grant_type: "authorization_code",
              code: str("code"),
              redirect_uri: str("redirectUri"),
              code_verifier: str("verifier"),
            }
          : { grant_type: "authorization_code", code: str("code"), redirect_uri: "postmessage" },
      );
      if (!g.refresh) {
        // Google sends a refresh token only on first consent; keep the stored one.
        const { data } = await db.rpc("music_link_read", { p_owner: owner, p_provider: provider });
        const old = (data as { refresh: string }[] | null)?.[0]?.refresh;
        if (!old) return json({ error: "relink" }, 409);
        await save(provider, old, g, g.scope);
      } else await save(provider, g.refresh, g, g.scope);
      return granted(g, g.scope);
    }

    if (action === "store") {
      // A sign in finished on a device before accounts kept them: move it here.
      const refresh = str("refresh");
      if (!refresh) return json({ error: "Nothing to store." }, 400);
      const g = await tokenCall(provider, { grant_type: "refresh_token", refresh_token: refresh });
      await save(provider, g.refresh || refresh, g, g.scope || str("scope"));
      return granted(g, g.scope || str("scope"));
    }

    if (action === "token") {
      const { data, error } = await db.rpc("music_link_read", {
        p_owner: owner,
        p_provider: provider,
      });
      if (error) throw new Error(error.message);
      const row = (
        data as
          | {
              refresh: string;
              access: string | null;
              access_expires: string | null;
              scope: string;
            }[]
          | null
      )?.[0];
      if (!row) return json({ error: "not_linked" }, 404);
      const left = row.access_expires ? Date.parse(row.access_expires) - Date.now() : 0;
      if (row.access && left > 120_000)
        return json({ access: row.access, expiresIn: Math.floor(left / 1000), scope: row.scope });
      if (provider === "youtube" && !GOOGLE_CLIENT_SECRET)
        return json({ error: "not_configured" }, 501);
      const g = await tokenCall(provider, {
        grant_type: "refresh_token",
        refresh_token: row.refresh,
      });
      await save(provider, g.refresh || row.refresh, g, g.scope || row.scope);
      return granted(g, g.scope || row.scope);
    }

    if (action === "disconnect") {
      const { data } = await db.rpc("music_link_read", { p_owner: owner, p_provider: provider });
      const refresh = (data as { refresh: string }[] | null)?.[0]?.refresh;
      if (refresh && provider === "youtube")
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, {
          method: "POST",
        }).catch(() => undefined);
      await save(provider, "", null, "");
      return json({ ok: true });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    if (error instanceof Relink && provider) {
      await save(provider, "", null, "").catch(() => undefined);
      return json({ error: "relink" }, 409);
    }
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});
