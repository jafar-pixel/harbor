// Black Cinema sync: keeps public.black_cinema_titles filled in.
//
//   seed     reads the master list from the repository (list.txt and black-box.txt) and adds or
//            updates every title, so editing the list on GitHub updates the hub.
//   lookup   finds titles on TMDB (TMDB_API_KEY), falling back to Trakt (TRAKT_CLIENT_ID) for what
//            TMDB doesn't know, and fills in ids, artwork, genres, providers and popularity.
//   refresh  re-reads found titles every few days: popularity (Top Ten, Trending) and providers.
//   run      lookup, then refresh: what the schedule calls.
//
// Called by pg_cron through pg_net with the x-sync-token header: a random token kept in the
// database's vault (black_cinema_sync_token(), service role only). The function checks it itself,
// so the JWT check is off. Secrets never leave this function.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { mergeTitles, parseList } from "./seed.mjs";

const REPO_RAW = "https://raw.githubusercontent.com/jafar-pixel/harbor";
const DEFAULT_REF = "tv/main";
const LIST_DIR = "supabase/jl-vision/black-cinema";
const TMDB = "https://api.themoviedb.org/3";
const TRAKT = "https://api.trakt.tv";
const RETRY_NOT_FOUND_DAYS = 7;
const REFRESH_DAYS = 3;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Row = {
  id: number;
  title: string;
  release_year: number;
  media_type: "movie" | "series";
  categories: string[];
  tmdb_id: number | null;
  lookup_attempts: number;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// ---------- seed ----------

async function seed(ref: string) {
  const read = async (name: string) => {
    const res = await fetch(`${REPO_RAW}/${ref}/${LIST_DIR}/${name}`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return res.text();
  };
  const titles = mergeTitles([...parseList(await read("list.txt")), ...parseList(await read("black-box.txt"))]);
  let written = 0;
  for (let i = 0; i < titles.length; i += 200) {
    const rows = titles.slice(i, i + 200).map((t: any) => ({
      title: t.title,
      release_year: t.year,
      media_type: t.type,
      decade: t.decade,
      categories: [...t.categories],
      original_network: [...t.networks][0] ?? null,
      networks: [...t.networks],
      franchise: t.franchise,
    }));
    // Categories already added from TMDB (genres, crew) are kept: merged in the database.
    const { error } = await db.rpc("black_cinema_upsert", { rows });
    if (error) throw new Error(`upsert: ${error.message}`);
    written += rows.length;
  }
  return { titles: titles.length, written };
}

// ---------- TMDB ----------

const tmdbKey = () => Deno.env.get("TMDB_API_KEY") ?? "";

async function tmdb(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB}/${path}`);
  url.searchParams.set("api_key", tmdbKey());
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TMDB ${path}: HTTP ${res.status}`);
    return res.json();
  }
  throw new Error(`TMDB ${path}: rate limited`);
}

type Hit = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
};

// Names TMDB puts before a title ("Tyler Perry's Sistas", "Marvel's Luke Cage"); the list may
// have them or not.
const PREFIX = /^(tyler perry'?s|marvel'?s|lee daniels'?|carl weber'?s|craig ross jr\.?'?s|terry mcmillan presents:?)\s+/i;

/** A title's matching forms: as written, without a prefix, and without a subtitle. */
function forms(name: string): { full: Set<string>; short: Set<string> } {
  const bare = name.replace(PREFIX, "");
  const full = new Set([norm(name), norm(bare)]);
  // "Self Made: Inspired by the Life of Madam C.J. Walker", "Summer of Soul (...Or, When ...)".
  const short = new Set([name, bare].map((n) => norm(n.split(/\s*[:(\u2013\u2014]\s*/)[0])));
  return { full, short };
}

/**
 * The same title within `slack` years of the listed year, the best known first. A match on the
 * title without its subtitle or prefix also counts, but only within a year, so a same-named film
 * from another decade is never taken.
 */
function pick(row: Row, hits: Hit[], slack: number): Hit | null {
  const want = forms(row.title);
  const scored = hits
    .map((h) => {
      const names = [h.title, h.name, h.original_title, h.original_name].filter(Boolean) as string[];
      const year = Number((h.release_date ?? h.first_air_date ?? "").slice(0, 4));
      const gap = year ? Math.abs(year - row.release_year) : 0;
      const exact = names.some((n) => [...forms(n).full].some((f) => want.full.has(f)));
      const loose =
        !exact &&
        names.some((n) => {
          const f = forms(n);
          return [...f.full, ...f.short].some((x) => want.full.has(x) || want.short.has(x));
        });
      if (exact && gap <= slack) return { h, rank: 0 };
      if (loose && gap <= 1) return { h, rank: 1 };
      return null;
    })
    .filter((x): x is { h: Hit; rank: number } => x !== null);
  scored.sort((a, b) => a.rank - b.rank || (b.h.popularity ?? 0) - (a.h.popularity ?? 0));
  return scored[0]?.h ?? null;
}

async function searchTmdb(row: Row): Promise<number | null> {
  const kind = row.media_type === "movie" ? "movie" : "tv";
  const yearKey = kind === "movie" ? "year" : "first_air_date_year";
  const withYear = await tmdb(`search/${kind}`, { query: row.title, [yearKey]: String(row.release_year) });
  const hit = pick(row, withYear?.results ?? [], 1);
  if (hit) return hit.id;
  // Festival, wide and streaming releases often fall in different years.
  const any = await tmdb(`search/${kind}`, { query: row.title });
  const anyHit = pick(row, any?.results ?? [], 2);
  if (anyHit) return anyHit.id;
  // Without a prefix the list may carry ("Tyler Perry's She the People" is "She the People").
  const bare = row.title.replace(PREFIX, "");
  if (bare === row.title) return null;
  const again = await tmdb(`search/${kind}`, { query: bare });
  return pick(row, again?.results ?? [], 2)?.id ?? null;
}

// ---------- Trakt (what TMDB doesn't know) ----------

async function searchTrakt(row: Row) {
  const clientId = Deno.env.get("TRAKT_CLIENT_ID");
  if (!clientId) return null;
  const kind = row.media_type === "movie" ? "movie" : "show";
  const url = new URL(`${TRAKT}/search/${kind}`);
  url.searchParams.set("query", row.title);
  url.searchParams.set("extended", "full");
  const res = await fetch(url, {
    headers: { "trakt-api-version": "2", "trakt-api-key": clientId, "Content-Type": "application/json" },
  });
  if (!res.ok) return null;
  const want = norm(row.title);
  const hits = ((await res.json()) as Array<Record<string, any>>)
    .map((h) => h[kind])
    .filter((m) => m && norm(m.title ?? "") === want && (!m.year || Math.abs(m.year - row.release_year) <= 2));
  return hits[0] ?? null;
}

// ---------- categories from TMDB ----------

const GENRE_ROWS: Record<string, string> = {
  Crime: "Black Crime & Urban Drama",
  Romance: "Black Romance & Relationships",
  Horror: "Black Horror & Science Fiction",
  "Science Fiction": "Black Horror & Science Fiction",
  "Sci-Fi & Fantasy": "Black Horror & Science Fiction",
  Action: "Black Action & Thrillers",
  "Action & Adventure": "Black Action & Thrillers",
  Thriller: "Black Action & Thrillers",
  Mystery: "Black Action & Thrillers",
  History: "Black History & Biographies",
  War: "Black History & Biographies",
  "War & Politics": "Black History & Biographies",
  Documentary: "Black Documentaries",
  Music: "Black Music & Hip-Hop",
  Family: "Black Family Entertainment",
  Animation: "Black Family Entertainment",
  Kids: "Black Family Entertainment",
};

// African and Caribbean countries (ISO 3166-1), for African & Caribbean Cinema.
const AFRICA_CARIBBEAN = new Set(
  (
    "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU " +
    "MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW AG BS BB BZ CU DM DO GD GY HT JM KN LC VC SR TT"
  ).split(" "),
);

function derivedCategories(d: any): string[] {
  const out = new Set<string>();
  for (const g of d.genres ?? []) if (GENRE_ROWS[g.name]) out.add(GENRE_ROWS[g.name]);
  const people = [
    ...(d.credits?.crew ?? []),
    ...(d.aggregate_credits?.crew ?? []),
    ...(d.created_by ?? []),
  ].map((p: any) => p.name);
  if (people.includes("Tyler Perry")) out.add("Tyler Perry Collection");
  if (people.includes("Spike Lee")) out.add("Spike Lee Collection");
  const keywords = [...(d.keywords?.keywords ?? []), ...(d.keywords?.results ?? [])].map((k: any) =>
    String(k.name).toLowerCase(),
  );
  if (keywords.some((k) => /christmas|holiday season/.test(k))) out.add("Black Christmas & Holiday Movies");
  if (keywords.some((k) => /stand-up|standup/.test(k))) out.add("Black Stand-Up Comedy");
  if (keywords.some((k) => /hbcu|historically black college/.test(k))) out.add("HBCU Movies & Television");
  if (keywords.some((k) => /biography|biopic/.test(k))) out.add("Black History & Biographies");
  const countries = [
    ...(d.production_countries ?? []).map((c: any) => c.iso_3166_1),
    ...(d.origin_country ?? []),
  ];
  if (countries.some((c: string) => AFRICA_CARIBBEAN.has(c))) out.add("African & Caribbean Cinema");
  return [...out];
}

async function tmdbDetails(kind: "movie" | "tv", id: number) {
  const credits = kind === "movie" ? "credits" : "aggregate_credits";
  return tmdb(`${kind}/${id}`, { append_to_response: `${credits},keywords,external_ids,watch/providers` });
}

function detailsUpdate(row: Row, d: any) {
  const us = d["watch/providers"]?.results?.US ?? {};
  const providers = [...(us.flatrate ?? []), ...(us.free ?? []), ...(us.ads ?? [])].map((p: any) => p.provider_name);
  return {
    tmdb_id: d.id,
    imdb_id: d.imdb_id ?? d.external_ids?.imdb_id ?? null,
    poster_path: d.poster_path ?? null,
    backdrop_path: d.backdrop_path ?? null,
    overview: d.overview || null,
    release_date: d.release_date || d.first_air_date || null,
    popularity: d.popularity ?? null,
    vote_average: d.vote_average ?? null,
    vote_count: d.vote_count ?? null,
    genres: (d.genres ?? []).map((g: any) => g.name),
    categories: [...new Set([...row.categories, ...derivedCategories(d)])],
    streaming_providers: [...new Set(providers)],
  };
}

// ---------- lookup and refresh ----------

async function lookup(limit: number) {
  if (!tmdbKey()) throw new Error("TMDB_API_KEY is not set");
  const { data, error } = await db
    .from("black_cinema_titles")
    .select("id,title,release_year,media_type,categories,tmdb_id,lookup_attempts")
    .or(
      `lookup_status.eq.pending,and(lookup_status.in.(not_found,trakt),looked_up_at.lt.${daysAgo(RETRY_NOT_FOUND_DAYS)})`,
    )
    .order("lookup_attempts")
    .order("id")
    .limit(limit);
  if (error) throw new Error(error.message);
  const counts = { found: 0, trakt: 0, not_found: 0, failed: 0 };
  await eachLimited(data as Row[], 4, async (row) => {
    try {
      const kind = row.media_type === "movie" ? "movie" : "tv";
      let id = await searchTmdb(row);
      let trakt: any = null;
      if (!id) {
        trakt = await searchTrakt(row);
        id = trakt?.ids?.tmdb ?? null;
      }
      const base = { lookup_attempts: row.lookup_attempts + 1, looked_up_at: new Date().toISOString() };
      let update: Record<string, unknown>;
      if (id) {
        const d = await tmdbDetails(kind, id);
        update = d ? { ...base, ...detailsUpdate(row, d), lookup_status: "found", trakt_id: trakt?.ids?.trakt ?? null } : { ...base, lookup_status: "not_found" };
      } else if (trakt) {
        update = {
          ...base,
          lookup_status: "trakt",
          trakt_id: trakt.ids?.trakt ?? null,
          imdb_id: trakt.ids?.imdb ?? null,
          overview: trakt.overview ?? null,
          genres: trakt.genres ?? [],
        };
      } else {
        update = { ...base, lookup_status: "not_found" };
      }
      const { error: e } = await db.from("black_cinema_titles").update(update).eq("id", row.id);
      if (e) throw new Error(e.message);
      counts[update.lookup_status as keyof typeof counts] += 1;
    } catch (e) {
      console.warn(`lookup ${row.title} (${row.release_year}): ${e instanceof Error ? e.message : e}`);
      counts.failed += 1;
    }
  });
  return { checked: data?.length ?? 0, ...counts };
}

async function refresh(limit: number) {
  if (!tmdbKey()) throw new Error("TMDB_API_KEY is not set");
  const { data, error } = await db
    .from("black_cinema_titles")
    .select("id,title,release_year,media_type,categories,tmdb_id,lookup_attempts")
    .eq("lookup_status", "found")
    .lt("looked_up_at", daysAgo(REFRESH_DAYS))
    .order("looked_up_at")
    .limit(limit);
  if (error) throw new Error(error.message);
  let refreshed = 0;
  await eachLimited(data as Row[], 4, async (row) => {
    const d = await tmdbDetails(row.media_type === "movie" ? "movie" : "tv", row.tmdb_id!).catch(() => null);
    if (!d) return;
    const { error: e } = await db
      .from("black_cinema_titles")
      .update({ ...detailsUpdate(row, d), looked_up_at: new Date().toISOString() })
      .eq("id", row.id);
    if (!e) refreshed += 1;
  });
  return { refreshed };
}

async function eachLimited<T>(items: T[], n: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

let syncToken: string | null = null;

async function expectedToken(): Promise<string | null> {
  if (syncToken) return syncToken;
  const { data } = await db.rpc("black_cinema_sync_token");
  syncToken = typeof data === "string" && data.length >= 32 ? data : null;
  return syncToken;
}

Deno.serve(async (req) => {
  const token = await expectedToken();
  if (!token || req.headers.get("x-sync-token") !== token) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "run");
  const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 120);
  try {
    if (action === "seed") return json(await seed(String(body.ref ?? DEFAULT_REF)));
    if (action === "lookup") return json(await lookup(limit));
    if (action === "refresh") return json(await refresh(limit));
    if (action === "run") return json({ lookup: await lookup(limit), refresh: await refresh(Math.ceil(limit / 2)) });
    return json({ error: `unknown action ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
