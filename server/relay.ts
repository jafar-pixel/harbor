/**
 * The playback relay for the self-hosted web app (server/web-server.ts): it fetches a TV
 * provider's playlist, guide or stream on the server's own connection for a page that can't
 * (a secure page can't load plain-http addresses, and providers don't allow browsers).
 *
 * It only opens tickets that /api/relay-ticket (api/relay-ticket.ts) sealed with the same key for
 * a signed-in, allowed JL account: base64url(nonce | AES-256-GCM ciphertext | tag) over
 * {"u": url, "e": expiresAt}. A live HLS playlist is rewritten so its segments, keys and
 * variant playlists come back through the relay with tickets of their own.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PREFIX = "/secure/";
const PLAYER_AGENT = "VLC/3.0.20 LibVLC/3.0.20";
/** How long to wait for a provider to answer before giving up (a stream then runs on). */
const ANSWER_MS = 20_000;

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function relayKey(hex: string): Promise<CryptoKey> | null {
  if (!/^[a-f0-9]{64}$/.test(hex)) return null;
  const raw = new Uint8Array(new ArrayBuffer(32));
  for (let i = 0; i < 32; i++) raw[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealTicket(
  key: CryptoKey,
  url: string,
  expiresAt: number,
  account?: string,
): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const payload = account ? { u: url, e: expiresAt, s: account } : { u: url, e: expiresAt };
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, body),
  );
  const out = new Uint8Array(nonce.length + sealed.length);
  out.set(nonce);
  out.set(sealed, nonce.length);
  return base64url(out);
}

/** The ticket's address and expiry, or null for a forged, damaged or expired ticket. */
export async function openTicket(
  key: CryptoKey,
  ticket: string,
  now = Date.now(),
): Promise<{ url: string; expiresAt: number; account: string } | null> {
  const bytes = fromBase64url(ticket);
  if (!bytes || bytes.length < 12 + 16 + 2) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, 12) },
      key,
      bytes.subarray(12),
    );
    const v = JSON.parse(new TextDecoder().decode(plain)) as {
      u?: unknown;
      e?: unknown;
      s?: unknown;
    };
    if (typeof v.u !== "string" || typeof v.e !== "number" || v.e <= now) return null;
    if (!/^https?:\/\/[^/\s]+/i.test(v.u)) return null;
    return { url: v.u, expiresAt: v.e, account: typeof v.s === "string" ? v.s : "" };
  } catch {
    return null;
  }
}

/** The relay path ends in the original file name, so players can tell HLS from TS. */
export function relayName(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").pop() ?? "";
    return last.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80) || "media";
  } catch {
    return "media";
  }
}

/** Whether a body is a live HLS playlist (an IPTV channel list is also #EXTM3U, but has no #EXT-X- tags). */
export function isHlsPlaylist(text: string): boolean {
  return text.trimStart().startsWith("#EXTM3U") && text.includes("#EXT-X-");
}

/**
 * Points every address in an HLS playlist (segments, variant playlists, keys, init maps) back at
 * the relay, resolved against the playlist's own address.
 */
export async function rewriteHls(
  text: string,
  playlistUrl: string,
  ticketFor: (url: string) => Promise<string>,
): Promise<string> {
  const through = async (ref: string) => {
    const abs = new URL(ref, playlistUrl).href;
    return `${PREFIX}${await ticketFor(abs)}/${relayName(abs)}`;
  };
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
    } else if (trimmed.startsWith("#")) {
      const parts = trimmed.split(/URI="([^"]*)"/);
      if (parts.length === 1) {
        out.push(line);
        continue;
      }
      let rebuilt = "";
      for (let i = 0; i < parts.length; i++) {
        rebuilt += i % 2 === 0 ? parts[i] : `URI="${await through(parts[i])}"`;
      }
      out.push(rebuilt);
    } else {
      out.push(await through(trimmed));
    }
  }
  return out.join("\n");
}

const PASS_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
];

export type RelayOptions = {
  /** Hosts ("host" or "host:port") on the home network the relay may still reach. */
  allowHosts?: ReadonlySet<string>;
  /** Lets the relay reach any address, home network included (tests only). */
  allowPrivate?: boolean;
  /** Provider requests one account may have open at once. */
  maxPerAccount?: number;
};

/**
 * Whether an address is on a home or internal network (or this machine): the relay serves
 * accounts other than the owner's, so it must never be a way into the house.
 */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(ip) === 6) {
    if (ip === "::" || ip === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(f[cd]|fe[89ab]|ff)/.test(ip);
  }
  return true;
}

/** Whether a provider address may be fetched: public, or one the owner allowed. */
export async function reachable(target: URL, options: RelayOptions): Promise<boolean> {
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;
  if (options.allowPrivate) return true;
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (options.allowHosts?.has(host) || options.allowHosts?.has(target.host.toLowerCase())) {
    return true;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (isIP(host)) return !isPrivateAddress(host);
  try {
    const found = await lookup(host, { all: true });
    return found.length > 0 && found.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

const MAX_REDIRECTS = 5;
const open = new Map<string, number>();

/** Answers GET /secure/<ticket>/<name>; null for any other path. */
export async function relay(
  req: Request,
  key: CryptoKey | null,
  options: RelayOptions = {},
): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (!key) return new Response("Not found", { status: 404 });
  if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405 });
  const ticket = url.pathname.slice(PREFIX.length).split("/")[0] ?? "";
  const opened = await openTicket(key, ticket);
  if (!opened) return new Response("Forbidden", { status: 403 });

  // One account can't take the whole connection: past its share, it waits its turn.
  const account = opened.account || "owner";
  const limit = options.maxPerAccount ?? 6;
  if ((open.get(account) ?? 0) >= limit) {
    return new Response("Too many streams for this account", {
      status: 429,
      headers: { "Retry-After": "2" },
    });
  }
  open.set(account, (open.get(account) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const n = (open.get(account) ?? 1) - 1;
    if (n > 0) open.set(account, n);
    else open.delete(account);
  };

  try {
    const { response, streaming } = await fetchThrough(req, key, opened, options, release);
    if (!streaming) release();
    return response;
  } catch (error) {
    release();
    throw error;
  }
}

async function fetchThrough(
  req: Request,
  key: CryptoKey,
  opened: { url: string; expiresAt: number; account: string },
  options: RelayOptions,
  release: () => void,
): Promise<{ response: Response; streaming: boolean }> {
  const done = (response: Response) => ({ response, streaming: false });
  const headers = new Headers({ "User-Agent": PLAYER_AGENT, Accept: "*/*" });
  const range = req.headers.get("range");
  if (range) headers.set("Range", range);
  const answered = new AbortController();
  const timer = setTimeout(() => answered.abort(), ANSWER_MS);
  // The viewer leaving (a closed request) stops the provider fetch too.
  req.signal.addEventListener("abort", () => answered.abort(), { once: true });
  let upstream: Response | null = null;
  let current = new URL(opened.url);
  try {
    // Redirects are followed by hand, so each hop is checked before it is fetched.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await reachable(current, options))) {
        return done(new Response("This address can't be relayed", { status: 403 }));
      }
      const res = await fetch(current, {
        method: req.method,
        headers,
        redirect: "manual",
        signal: answered.signal,
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) {
        upstream = res;
        break;
      }
      await res.body?.cancel().catch(() => {});
      current = new URL(location, current);
    }
  } catch {
    return done(new Response("Provider unreachable", { status: 502 }));
  } finally {
    clearTimeout(timer);
  }
  if (!upstream) return done(new Response("Too many redirects", { status: 502 }));

  const finalUrl = current.href;
  const out = new Headers({ "Cache-Control": "no-store" });
  for (const name of PASS_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  const type = (upstream.headers.get("content-type") ?? "").toLowerCase();
  const maybeHls = type.includes("mpegurl") || /\.m3u8$/i.test(current.pathname);
  if (maybeHls && upstream.ok && req.method === "GET") {
    const text = await upstream.text();
    if (isHlsPlaylist(text)) {
      const body = await rewriteHls(text, finalUrl, (u) =>
        sealTicket(key, u, opened.expiresAt, opened.account || undefined),
      );
      out.delete("content-length");
      out.delete("content-range");
      out.delete("etag");
      out.set("content-type", "application/vnd.apple.mpegurl");
      return done(new Response(body, { status: 200, headers: out }));
    }
    out.delete("content-length");
    return done(new Response(text, { status: upstream.status, headers: out }));
  }
  if (req.method === "HEAD" || !upstream.body) {
    await upstream.body?.cancel().catch(() => {});
    return done(new Response(null, { status: upstream.status, headers: out }));
  }
  // The account's share is given back when the stream ends, fails or the viewer leaves.
  const body = upstream.body.pipeThrough(
    new TransformStream({
      flush: release,
    }),
  );
  req.signal.addEventListener("abort", release, { once: true });
  return {
    response: new Response(body, { status: upstream.status, headers: out }),
    streaming: true,
  };
}
