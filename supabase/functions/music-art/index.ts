// Album art for the Music Hub's posters: the cover for each song (from Apple's public iTunes
// Search, no key needed), looked up server-side and cached in media.music_search_cache for every
// user. Callers must be signed in to JL (the platform verifies the JWT before this runs).
import { createClient } from "jsr:@supabase/supabase-js@2";

const TTL_MS = 30 * 24 * 3600_000;
const MISS_TTL_MS = 3 * 24 * 3600_000;
const MAX_ITEMS = 24;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Art = { art: string; album: string; year: string; genre: string } | null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

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

const clean = (s: unknown) =>
  typeof s === "string" ? s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 100) : "";
const loose = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]|feat\..*$/g, "")
    .replace(/[^a-z0-9]/g, "");

async function lookup(artist: string, title: string): Promise<Art> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", `${artist} ${title}`);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "5");
  url.searchParams.set("country", "US");
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  const data = (await res.json()) as {
    results?: {
      artistName?: string;
      trackName?: string;
      collectionName?: string;
      artworkUrl100?: string;
      releaseDate?: string;
      primaryGenreName?: string;
    }[];
  };
  const results = data.results ?? [];
  const a = loose(artist);
  const t = loose(title);
  // Prefer the same artist and song; then the same artist; then whatever iTunes ranked first.
  const pick =
    results.find((r) => loose(r.artistName ?? "").includes(a) && loose(r.trackName ?? "") === t) ??
    results.find((r) => loose(r.artistName ?? "").includes(a)) ??
    null;
  if (!pick?.artworkUrl100) return null;
  return {
    art: pick.artworkUrl100.replace(/\/\d+x\d+bb\./, "/600x600bb."),
    album: pick.collectionName ?? "",
    year: (pick.releaseDate ?? "").slice(0, 4),
    genre: pick.primaryGenreName ?? "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!signedIn(req)) return json({ error: "Sign in to your JL Media Vision account." }, 401);
  let body: { items?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const items = (Array.isArray(body.items) ? body.items : [])
    .slice(0, MAX_ITEMS)
    .map((i) => ({ artist: clean(i?.artist), title: clean(i?.title) }))
    .filter((i) => i.artist && i.title);
  if (!items.length) return json({ results: {} });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "media" },
  });
  const keyOf = (i: { artist: string; title: string }) => `art:${i.artist}|${i.title}`;
  const keys = [...new Set(items.map(keyOf))];
  const { data: hits } = await db
    .from("music_search_cache")
    .select("q, results, fetched_at")
    .in("q", keys);
  const out: Record<string, Art> = {};
  const now = Date.now();
  for (const h of hits ?? []) {
    // The cache keeps lists: [art] for a cover, [] for none found.
    const art = ((h.results as Art[])[0] ?? null) as Art;
    const age = now - Date.parse(h.fetched_at);
    if (age < (art ? TTL_MS : MISS_TTL_MS)) out[h.q] = art;
  }

  const missing = items.filter((i) => !(keyOf(i) in out));
  const fresh: { q: string; results: Art[]; fetched_at: string }[] = [];
  // A few at a time: iTunes Search allows roughly 20 requests a minute per address.
  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(
      missing.slice(i, i + 4).map(async (item) => {
        try {
          const art = await lookup(item.artist, item.title);
          out[keyOf(item)] = art;
          fresh.push({ q: keyOf(item), results: art ? [art] : [], fetched_at: new Date().toISOString() });
        } catch {
          // Rate-limited or offline: leave it out, the next request tries again.
        }
      }),
    );
  }
  if (fresh.length) await db.from("music_search_cache").upsert(fresh);
  return json({ results: out });
});
