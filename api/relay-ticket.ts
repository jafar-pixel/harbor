// Vercel Edge Function: signs short-lived tickets for the owner's home playback relay, so the web
// app can reach a TV provider that refuses cloud servers and plain-http pages. The relay (the
// jl-netfin repo's ops/playback-relay.mjs) opens AES-256-GCM tickets of the form
// base64url(nonce | ciphertext | tag) over {"u": url, "e": expiresAt} and follows HLS itself.
//
// Off unless configured, and never open: the caller must be signed in to a JL account listed in
// PLAYBACK_RELAY_USERS. Settings (Vercel environment):
//   PLAYBACK_RELAY_KEY    64 hex characters, the same key the relay uses
//   PLAYBACK_RELAY_BASE   the relay's public address ending in /secure
//   PLAYBACK_RELAY_USERS  comma-separated JL account emails or user ids allowed to use it
export const config = { runtime: "edge" };

const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_URLS = 20;

function env(name: string): string {
  const p = (globalThis as { process?: { env: Record<string, string | undefined> } }).process;
  return p?.env[name]?.trim() ?? "";
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function seal(key: CryptoKey, payload: unknown): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const body = new TextEncoder().encode(JSON.stringify(payload));
  // WebCrypto appends the 16-byte tag to the ciphertext, which is the layout the relay reads.
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, body),
  );
  const out = new Uint8Array(nonce.length + sealed.length);
  out.set(nonce);
  out.set(sealed, nonce.length);
  return base64url(out);
}

async function signedInUser(req: Request): Promise<{ id: string; email: string } | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  const supabaseUrl = env("VITE_JL_SUPABASE_URL");
  const anonKey = env("VITE_JL_SUPABASE_ANON_KEY");
  if (!token || !supabaseUrl || !anonKey) return null;
  const res = await fetch(new URL("/auth/v1/user", supabaseUrl), {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const user = (await res.json().catch(() => null)) as { id?: string; email?: string } | null;
  return user?.id ? { id: user.id, email: (user.email ?? "").toLowerCase() } : null;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method" });
  const secret = env("PLAYBACK_RELAY_KEY");
  const base = env("PLAYBACK_RELAY_BASE").replace(/\/+$/, "");
  const allowed = env("PLAYBACK_RELAY_USERS")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!/^[a-f0-9]{64}$/.test(secret) || !base.startsWith("https://") || allowed.length === 0) {
    return json(404, { error: "not-configured" });
  }
  const user = await signedInUser(req);
  if (!user) return json(401, { error: "sign-in" });
  if (!allowed.includes(user.id.toLowerCase()) && !(user.email && allowed.includes(user.email))) {
    return json(403, { error: "not-allowed" });
  }

  const body = (await req.json().catch(() => null)) as { urls?: unknown } | null;
  const urls = Array.isArray(body?.urls) ? body.urls : [];
  if (urls.length === 0 || urls.length > MAX_URLS) return json(400, { error: "urls" });
  for (const u of urls) {
    if (typeof u !== "string" || u.length > 4000 || !/^https?:\/\/[^/\s]+/i.test(u)) {
      return json(400, { error: "urls" });
    }
  }

  const key = await crypto.subtle.importKey("raw", hexBytes(secret), "AES-GCM", false, ["encrypt"]);
  const expiresAt = Date.now() + TTL_MS;
  const tickets = await Promise.all((urls as string[]).map((u) => seal(key, { u, e: expiresAt })));
  return json(200, { base, tickets, expiresAt });
}
