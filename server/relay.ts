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

export async function sealTicket(key: CryptoKey, url: string, expiresAt: number): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const body = new TextEncoder().encode(JSON.stringify({ u: url, e: expiresAt }));
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
): Promise<{ url: string; expiresAt: number } | null> {
  const bytes = fromBase64url(ticket);
  if (!bytes || bytes.length < 12 + 16 + 2) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, 12) },
      key,
      bytes.subarray(12),
    );
    const v = JSON.parse(new TextDecoder().decode(plain)) as { u?: unknown; e?: unknown };
    if (typeof v.u !== "string" || typeof v.e !== "number" || v.e <= now) return null;
    if (!/^https?:\/\/[^/\s]+/i.test(v.u)) return null;
    return { url: v.u, expiresAt: v.e };
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

/** Answers GET /secure/<ticket>/<name>; null for any other path. */
export async function relay(req: Request, key: CryptoKey | null): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (!key) return new Response("Not found", { status: 404 });
  if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405 });
  const ticket = url.pathname.slice(PREFIX.length).split("/")[0] ?? "";
  const opened = await openTicket(key, ticket);
  if (!opened) return new Response("Forbidden", { status: 403 });

  const headers = new Headers({ "User-Agent": PLAYER_AGENT, Accept: "*/*" });
  const range = req.headers.get("range");
  if (range) headers.set("Range", range);
  const answered = new AbortController();
  const timer = setTimeout(() => answered.abort(), ANSWER_MS);
  // The viewer leaving (a closed request) stops the provider fetch too.
  req.signal.addEventListener("abort", () => answered.abort(), { once: true });
  let upstream: Response;
  try {
    upstream = await fetch(opened.url, {
      method: req.method,
      headers,
      redirect: "follow",
      signal: answered.signal,
    });
  } catch {
    return new Response("Provider unreachable", { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  const out = new Headers({ "Cache-Control": "no-store" });
  for (const name of PASS_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  const type = (upstream.headers.get("content-type") ?? "").toLowerCase();
  const maybeHls =
    type.includes("mpegurl") || /\.m3u8$/i.test(new URL(upstream.url || opened.url).pathname);
  if (maybeHls && upstream.ok && req.method === "GET") {
    const text = await upstream.text();
    if (isHlsPlaylist(text)) {
      const body = await rewriteHls(text, upstream.url || opened.url, (u) =>
        sealTicket(key, u, opened.expiresAt),
      );
      out.delete("content-length");
      out.delete("content-range");
      out.delete("etag");
      out.set("content-type", "application/vnd.apple.mpegurl");
      return new Response(body, { status: 200, headers: out });
    }
    out.delete("content-length");
    return new Response(text, { status: upstream.status, headers: out });
  }
  return new Response(req.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  });
}
