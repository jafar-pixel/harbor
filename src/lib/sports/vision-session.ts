/**
 * A single JL Vision Supabase session reader for Sports Settings and artwork.
 * This is NOT a Stremio-token exchange or a replacement for JL account SSO.
 */
const ROOT = "https://ajbjyjfiglzodbdcdapr.supabase.co";
const KEY = "jl-vision-supabase-session";
type Stored = { access_token?: string; refresh_token?: string; expires_at?: number; user?: { id?: string } };
export type VisionSession = { accessToken: string; publishableKey: string };
let pending: Promise<VisionSession | null> | null = null;
function readStored(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? value as Stored : null;
  } catch { return null; }
}
function tokenExpiry(jwt: string): number | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const data = JSON.parse(atob(base64)) as { exp?: number };
    return typeof data.exp === "number" ? data.exp : null;
  } catch { return null; }
}
async function getSession(): Promise<VisionSession | null> {
  const publishableKey = import.meta.env.VITE_JL_VISION_SUPABASE_ANON_KEY as string | undefined;
  if (!publishableKey) return null;
  const item = readStored();
  if (!item?.access_token) return null;
  const expiresAt = item.expires_at || tokenExpiry(item.access_token);
  if (expiresAt && expiresAt > Date.now()/1000 + 60) return { accessToken: item.access_token, publishableKey };
  if (!item.refresh_token) return null;
  const response = await fetch(ROOT + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: item.refresh_token }),
  });
  if (!response.ok) return null;
  const next = await response.json() as Stored & { expires_in?: number };
  if (!next.access_token || !next.refresh_token) return null;
  const expires = next.expires_at || (Date.now()/1000 + (next.expires_in || 3600));
  sessionStorage.setItem(KEY, JSON.stringify({ ...next, expires_at: expires }));
  return { accessToken: next.access_token, publishableKey };
}
export async function readVisionSession(): Promise<VisionSession | null> {
  if (!pending) pending = getSession().finally(() => { pending = null; });
  return pending;
}
export function clearVisionSession(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
