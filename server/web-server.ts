/**
 * The JL Media Vision website on its own server, in place of Vercel: the built app (dist/), the
 * download site on its own host, and the two functions the web app calls (api/proxy.ts and
 * api/relay-ticket.ts, run unchanged), plus the playback relay (relay.ts) that used to be a
 * separate service. Routing mirrors vercel.json.
 *
 *   node --experimental-strip-types server/web-server.ts
 *
 * Settings (environment):
 *   PORT, HOST                   where to listen (default 127.0.0.1:3000)
 *   JL_WEB_DIST                  the built app (default ./dist)
 *   JL_SITE_HOSTS                hosts that show the download site (default mediavision.jl-stream.com)
 *   JL_APP_URL                   where the site's /app link goes (default https://watch.jl-stream.com/)
 *   VITE_JL_SUPABASE_URL, VITE_JL_SUPABASE_ANON_KEY   to check who is signed in (relay tickets)
 *   PLAYBACK_RELAY_KEY           64 hex characters; the relay is off without it
 *   PLAYBACK_RELAY_BASE          "/secure" (this server)
 *   PLAYBACK_RELAY_USERS         JL account emails or user ids allowed to use the relay
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import proxy from "../api/proxy.ts";
import relayTicket from "../api/relay-ticket.ts";
import { relay, relayKey } from "./relay.ts";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const dist = resolve(process.env.JL_WEB_DIST ?? "dist");
const siteHosts = new Set(
  (process.env.JL_SITE_HOSTS ?? "mediavision.jl-stream.com")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
const appUrl = process.env.JL_APP_URL ?? "https://watch.jl-stream.com/";
const releases = "https://github.com/jafar-pixel/harbor/releases/latest/download";
const key = await (relayKey(process.env.PLAYBACK_RELAY_KEY?.trim() ?? "") ?? Promise.resolve(null));

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

function toRequest(req: IncomingMessage, url: URL): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const abort = new AbortController();
  req.on("close", () => {
    if (!req.complete || req.destroyed) abort.abort();
  });
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    signal: abort.signal,
    // Node's fetch needs this for a streamed request body.
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

async function send(res: ServerResponse, response: Response, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...SECURITY_HEADERS, ...extra };
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  const body = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
  res.on("close", () => body.destroy());
  body.on("error", () => res.destroy());
  body.pipe(res);
}

function redirect(res: ServerResponse, to: string) {
  res.writeHead(307, { ...SECURITY_HEADERS, Location: to });
  res.end();
}

/** A file inside dist/, or null (never a path outside it). */
async function file(path: string): Promise<string | null> {
  const full = resolve(join(dist, decodeURIComponent(path)));
  if (full !== dist && !full.startsWith(dist + sep)) return null;
  try {
    return (await stat(full)).isFile() ? full : null;
  } catch {
    return null;
  }
}

async function serveFile(res: ServerResponse, full: string, method: string) {
  const type = TYPES[extname(full).toLowerCase()] ?? "application/octet-stream";
  // Built assets carry a content hash in their name and never change; pages always revalidate.
  const cache = full.includes(`${sep}assets${sep}`)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": type, "Cache-Control": cache });
  if (method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(full)
    .on("error", () => res.destroy())
    .pipe(res);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const hostName = (req.headers.host ?? "").split(":")[0].toLowerCase();
  const url = new URL(req.url ?? "/", `http://${hostName || "localhost"}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  // The download site (mediavision.jl-stream.com), as in vercel.json.
  if (siteHosts.has(hostName)) {
    if (path === "/") return redirect(res, "/site");
    if (path === "/tv") return redirect(res, `${releases}/JL-Media-Vision-TV.apk`);
    if (path === "/windows") return redirect(res, `${releases}/JL-Media-Vision-Setup-x64.exe`);
    if (path === "/app") return redirect(res, appUrl);
  }

  if (path === "/api/proxy" || path.startsWith("/api-proxy/")) {
    if (path.startsWith("/api-proxy/"))
      url.searchParams.set("__target", path.slice("/api-proxy/".length));
    url.pathname = "/api/proxy";
    return send(res, await proxy(toRequest(req, url)));
  }
  if (path === "/api/relay-ticket") return send(res, await relayTicket(toRequest(req, url)));
  if (path.startsWith("/secure/")) {
    const answer = await relay(toRequest(req, url), key);
    if (answer) return send(res, answer);
  }
  if (path.startsWith("/api/")) return send(res, new Response("Not found", { status: 404 }));
  if (method !== "GET" && method !== "HEAD") return send(res, new Response(null, { status: 405 }));

  const exact = await file(path);
  if (exact) return serveFile(res, exact, method);
  const sitePage =
    path === "/site" ||
    path.startsWith("/site/") ||
    (siteHosts.has(hostName) && !/^\/(avatars\/|favicon)/.test(path));
  const fallback = await file(sitePage ? "/site/index.html" : "/index.html");
  if (fallback) return serveFile(res, fallback, method);
  return send(res, new Response("Not found", { status: 404 }));
}

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.error("[web-server]", error);
    if (!res.headersSent) res.writeHead(500, SECURITY_HEADERS);
    res.end();
  });
}).listen(port, host, () => {
  console.log(
    `[web-server] http://${host}:${port} serving ${dist}; relay ${key ? "on" : "off (no PLAYBACK_RELAY_KEY)"}`,
  );
});
