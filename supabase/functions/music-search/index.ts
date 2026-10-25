// Music Hub search for the web app: YouTube videos for a song, artist or vibe. Results are
// cached in media.music_search_cache for every user, so each query spends YouTube quota once.
// Callers must be signed in to JL (the platform verifies the JWT before this runs).
import { createClient } from "jsr:@supabase/supabase-js@2";

const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY") ?? "";
const TTL_MS = 7 * 24 * 3600_000;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Video = { id: string; title: string; channel: string; thumb: string; publishedAt: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

function normalize(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
}

/** The platform has verified the token's signature; only signed-in JL accounts may use quota. */
function signedIn(req: Request): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
    return claims.role === "authenticated" && typeof claims.sub === "string";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!signedIn(req)) return json({ error: "Sign in to your JL Media Vision account." }, 401);
  let body: { q?: unknown; max?: unknown; kind?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const q = typeof body.q === "string" ? normalize(body.q) : "";
  if (!q) return json({ error: "Missing q" }, 400);
  const max = Math.min(15, Math.max(1, Number(body.max) || 8));
  // "music" keeps to YouTube's Music category; "any" is for scenery and vibe videos.
  const kind = body.kind === "any" ? "any" : "music";
  const key = `${kind}:${max}:${q}`;

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      db: { schema: "media" },
    },
  );
  const { data: hit } = await db
    .from("music_search_cache")
    .select("results, fetched_at")
    .eq("q", key)
    .maybeSingle();
  if (hit && Date.now() - Date.parse(hit.fetched_at) < TTL_MS)
    return json({ results: hit.results, cached: true });

  if (!YOUTUBE_API_KEY) return json({ error: "YouTube search isn't set up yet." }, 503);
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("maxResults", String(max));
  url.searchParams.set("q", q);
  if (kind === "music") url.searchParams.set("videoCategoryId", "10");
  url.searchParams.set("key", YOUTUBE_API_KEY);
  const res = await fetch(url);
  if (!res.ok) {
    // Out of quota or a bad key: serve a stale result rather than nothing.
    if (hit) return json({ results: hit.results, cached: true, stale: true });
    const quota = res.status === 403;
    return json(
      {
        error: quota
          ? "YouTube's daily search limit was reached. Try again later."
          : "YouTube search failed.",
      },
      quota ? 429 : 502,
    );
  }
  const data = (await res.json()) as {
    items?: {
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        publishedAt?: string;
        thumbnails?: Record<string, { url?: string }>;
      };
    }[];
  };
  const results: Video[] = (data.items ?? [])
    .filter((i) => i.id?.videoId && i.snippet?.title)
    .map((i) => ({
      id: i.id!.videoId!,
      title: decode(i.snippet!.title!),
      channel: decode(i.snippet!.channelTitle ?? ""),
      thumb:
        i.snippet!.thumbnails?.high?.url ??
        i.snippet!.thumbnails?.medium?.url ??
        `https://i.ytimg.com/vi/${i.id!.videoId}/hqdefault.jpg`,
      publishedAt: i.snippet!.publishedAt ?? "",
    }));
  await db
    .from("music_search_cache")
    .upsert({ q: key, results, fetched_at: new Date().toISOString() });
  return json({ results, cached: false });
});
