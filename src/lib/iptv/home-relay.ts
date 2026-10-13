/**
 * The web app's way to a TV provider it can't reach itself: a secure page can't load plain-http
 * addresses, and many providers refuse cloud servers. The owner's home playback relay (the
 * jl-netfin repo's ops/playback-relay.mjs, on their own connection) fetches for it, using
 * short-lived tickets that /api/relay-ticket signs for allowed JL accounts. Desktop and TV apps
 * fetch providers natively and never come here; neither does anyone without a relay set up.
 */
import { browserBlocksProviderUrl } from "@/lib/native-fetch";

type Entry = { href: string; expiresAt: number };

const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<string | null>>();
// Not configured, or this account isn't allowed: stop asking until the page reloads.
let unavailable = false;
const SAFETY_MS = 10 * 60 * 1000;
const MAX_CACHE = 500;

/** The relay path ends in a file name; keep the original one so players can tell HLS from TS. */
export function relaySuffix(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").pop() ?? "";
    const clean = last.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80);
    return clean || "media";
  } catch {
    return "media";
  }
}

async function ticketFor(url: string): Promise<string | null> {
  const { freshJlSession } = await import("@/lib/jl/account/client");
  const session = await freshJlSession().catch(() => null);
  if (!session) return null;
  const res = await fetch("/api/relay-ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ urls: [url] }),
  }).catch(() => null);
  if (!res) return null;
  if (res.status === 404 || res.status === 403) {
    unavailable = true;
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    base?: string;
    tickets?: string[];
    expiresAt?: number;
  } | null;
  const ticket = body?.tickets?.[0];
  if (!body?.base || !ticket || typeof body.expiresAt !== "number") return null;
  const href = `${body.base}/${ticket}/${relaySuffix(url)}`;
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(url, { href, expiresAt: body.expiresAt });
  return href;
}

/**
 * The relay address for a provider URL the browser can't load, or null when the URL needs no
 * relay, no relay is set up, or the viewer isn't signed in to an allowed JL account.
 */
export async function viaHomeRelay(url: string): Promise<string | null> {
  if (unavailable || !browserBlocksProviderUrl(url)) return null;
  const hit = cache.get(url);
  if (hit && hit.expiresAt - SAFETY_MS > Date.now()) return hit.href;
  const inflight = pending.get(url);
  if (inflight) return inflight;
  const p = ticketFor(url).finally(() => pending.delete(url));
  pending.set(url, p);
  return p;
}
