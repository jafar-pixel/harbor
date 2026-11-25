/**
 * The Black Box: JL's own catalogs of Black film and television (Movies, Series, TV), named Black
 * Box beside the addons' catalogs in Catalogs and Discover's catalog picker. They gather
 * the work of the Black actors, actresses and hosts in BLACK_BOX_PEOPLE from TMDB, with the
 * viewer's TMDB key (Settings); without a key there is nothing to show.
 *
 * A title counts when it stars a Black actor or actress: one is among its first LEAD_BILLING billed
 * cast members on TMDB. Who is Black comes from Wikidata (people of BLACK_BOX_GROUPS) and
 * BLACK_BOX_PEOPLE. Candidates come from Wikidata (films and shows with such a person anywhere in
 * the cast, best known first) and each is checked against its TMDB billing before it is shown. When Wikidata can't be reached, TMDB alone is used:
 * Movies from its discover (any of the people in the cast), Series and TV from the people's TV
 * credits. Who each name is on TMDB is looked up by exact name once and kept on the device.
 */
import type { Meta } from "./cinemeta";
import {
  BLACK_BOX_PAGE_SIZE,
  isBlackBoxKind,
  type BlackBoxCatalogId,
  type BlackBoxCurated,
  blackBoxPeopleSparql,
  personIdsFromSparql,
  starsBlackLead,
  type BilledCast,
  blackBoxCatalogsFor,
  blackBoxIdsFromSparql,
  blackBoxSparql,
  showKind,
  BLACK_BOX_PEOPLE,
  blackBoxMovieParams,
  nameKey,
  pickPerson,
  rankShows,
  tvCreditKind,
  type BlackBoxKind,
  type PersonHit,
  type TvCredit,
} from "./black-box-core";
import { get } from "./providers/tmdb/tmdb-client";
import { tmdbDiscover } from "./providers/tmdb/tmdb-catalogs";
import {
  movieMeta,
  seriesMeta,
  type RawMovie,
  type RawSeries,
} from "./providers/tmdb/tmdb-meta-mappers";
import { safeFetch } from "./safe-fetch";
import {
  CLASSICS_90S,
  DECADE_2000S,
  DECADE_2010S,
  DECADE_2020S,
  NEW_2026_MOVIES,
  NEW_2026_SHOWS,
  pickCurated,
  type CuratedTitle,
} from "./black-box-curated";
import { loadStoredSettings } from "./settings/load";

export { BLACK_BOX_BASE, isBlackBoxCatalogId } from "./black-box-core";

const PEOPLE_STORE = "jl.blackBox.people.v1";
/** TMDB lookups at once: quick on a TV without tripping TMDB's rate limit. */
const PARALLEL = 8;

type PeopleMap = Record<string, number>;

function readPeople(): PeopleMap {
  try {
    const raw = localStorage.getItem(PEOPLE_STORE);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as PeopleMap) : {};
  } catch {
    return {};
  }
}

function writePeople(map: PeopleMap): void {
  try {
    localStorage.setItem(PEOPLE_STORE, JSON.stringify(map));
  } catch {}
}

/** Runs `work` over `items`, `PARALLEL` at a time. */
async function eachLimited<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, lane));
  return out;
}

let people: { key: string; ids: Promise<number[]> } | null = null;

/** TMDB ids of the people; names found before come from the device. */
function peopleIds(key: string): Promise<number[]> {
  if (people?.key === key) return people.ids;
  const ids = (async () => {
    const known = readPeople();
    const missing = BLACK_BOX_PEOPLE.filter((n) => !(nameKey(n) in known));
    if (missing.length > 0) {
      const found = await eachLimited(missing, (name) =>
        get<{ results?: PersonHit[] }>(key, "search/person", {
          query: name,
          include_adult: "false",
        })
          .then((data) => ({ name, id: pickPerson(name, data?.results ?? []), ok: true }))
          .catch(() => ({ name, id: null, ok: false })),
      );
      // Only answers are kept; a failed lookup is asked again next time.
      for (const f of found) if (f.ok) known[nameKey(f.name)] = f.id ?? 0;
      writePeople(known);
    }
    return BLACK_BOX_PEOPLE.map((n) => known[nameKey(n)]).filter((id): id is number => id > 0);
  })();
  people = { key, ids };
  void ids.then((list) => {
    if (list.length === 0 && people?.ids === ids) people = null;
  });
  return ids;
}

let shows: { key: string; lists: Promise<Record<"series" | "tv", TvCredit[]>> } | null = null;

/** Every person's TV credits, split into Series and TV and ranked, once per session. */
function showLists(key: string): Promise<Record<"series" | "tv", TvCredit[]>> {
  if (shows?.key === key) return shows.lists;
  const lists = (async () => {
    const ids = await peopleIds(key);
    const credits = await eachLimited(ids, (id) =>
      get<{ cast?: TvCredit[] }>(key, `person/${id}/tv_credits`)
        .then((data) => data?.cast ?? [])
        .catch(() => [] as TvCredit[]),
    );
    const series: TvCredit[] = [];
    const tv: TvCredit[] = [];
    for (const credit of credits.flat()) {
      const kind = tvCreditKind(credit);
      if (kind === "series") series.push(credit);
      else if (kind === "tv") tv.push(credit);
    }
    return { series: rankShows(series), tv: rankShows(tv) };
  })();
  shows = { key, lists };
  void lists.then((l) => {
    if (l.series.length + l.tv.length === 0 && shows?.lists === lists) shows = null;
  });
  return lists;
}

const WIKIDATA = "https://query.wikidata.org/sparql";
const WIKIDATA_STORE = "jl.blackBox.wikidata.v2";
const WIKIDATA_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** Fewer than this from Wikidata means it didn't really answer; TMDB alone is used then. */
const WIKIDATA_ENOUGH = 100;

/** Wikidata's answers: Black people's TMDB ids, and candidate films and shows, best known first. */
type WikidataStore = { at: number; people: number[]; movie: number[]; tv: number[] };

function readWikidata(): WikidataStore | null {
  try {
    const raw = localStorage.getItem(WIKIDATA_STORE);
    const parsed = raw ? (JSON.parse(raw) as WikidataStore) : null;
    if (!parsed || Date.now() - parsed.at > WIKIDATA_FRESH_MS) return null;
    const ok = [parsed.people, parsed.movie, parsed.tv].every(Array.isArray);
    return ok ? parsed : null;
  } catch {
    return null;
  }
}

function writeWikidata(store: WikidataStore): void {
  try {
    localStorage.setItem(WIKIDATA_STORE, JSON.stringify(store));
  } catch {}
}

async function askWikidata(query: string): Promise<unknown> {
  const url = `${WIKIDATA}?format=json&query=${encodeURIComponent(query)}`;
  const res = await safeFetch(url, { headers: { Accept: "application/sparql-results+json" } });
  return res.ok ? res.json() : null;
}

let wikidata: Promise<WikidataStore | null> | null = null;

/** Wikidata's answers, kept on the device for a week; null when Wikidata can't be reached. */
function wikidataTitles(key: string): Promise<WikidataStore | null> {
  if (wikidata) return wikidata;
  const stored = readWikidata();
  if (stored) return (wikidata = Promise.resolve(stored));
  const run = (async () => {
    const named = await peopleIds(key).catch(() => [] as number[]);
    const [people, movie, tv] = await Promise.all([
      askWikidata(blackBoxPeopleSparql())
        .then(personIdsFromSparql)
        .catch(() => [] as number[]),
      askWikidata(blackBoxSparql("movie", named))
        .then(blackBoxIdsFromSparql)
        .catch(() => [] as number[]),
      askWikidata(blackBoxSparql("tv", named))
        .then(blackBoxIdsFromSparql)
        .catch(() => [] as number[]),
    ]);
    if (people.length < WIKIDATA_ENOUGH || movie.length + tv.length < WIKIDATA_ENOUGH) return null;
    const store = { at: Date.now(), people, movie, tv };
    writeWikidata(store);
    return store;
  })();
  wikidata = run;
  // Asked again next time when it didn't answer.
  void run.then((store) => {
    if (!store && wikidata === run) wikidata = null;
  });
  return run;
}

/** The TMDB ids of every Black actor and actress known: Wikidata's and the named ones. */
async function blackPeople(key: string): Promise<Set<number>> {
  const [titles, named] = await Promise.all([wikidataTitles(key), peopleIds(key).catch(() => [])]);
  return new Set([...(titles?.people ?? []), ...named]);
}

type Details = {
  poster_path?: string | null;
  adult?: boolean;
  genres?: Array<{ id: number }>;
  credits?: { cast?: BilledCast[] };
  aggregate_credits?: { cast?: BilledCast[] };
};

/**
 * Reads candidate titles in order, a batch at a time, keeping those that star a Black actor or
 * actress, until a catalog has `want` titles or the candidates run out. One scan per catalog
 * source; Series and TV share theirs, since a show's kind is only known from its details.
 */
type Scan = {
  next: number;
  ended: boolean;
  kept: Record<BlackBoxKind, Meta[]>;
  queue: Promise<void>;
};

const scans = new Map<string, Scan>();

function scanFor(id: string): Scan {
  let scan = scans.get(id);
  if (!scan) {
    scan = {
      next: 0,
      ended: false,
      kept: { movies: [], series: [], tv: [] },
      queue: Promise.resolve(),
    };
    scans.set(id, scan);
  }
  return scan;
}

async function keepIfStarring(
  key: string,
  type: "movie" | "tv",
  id: number,
  black: ReadonlySet<number>,
): Promise<{ kind: BlackBoxKind; meta: Meta } | null> {
  const credits = type === "movie" ? "credits" : "aggregate_credits";
  const raw = await get<(RawMovie & RawSeries) & Details>(key, `${type}/${id}`, {
    append_to_response: credits,
  }).catch(() => null);
  if (!raw?.id || !raw.poster_path || raw.adult) return null;
  const cast = type === "movie" ? raw.credits?.cast : raw.aggregate_credits?.cast;
  if (!starsBlackLead(cast, black)) return null;
  const genreIds = raw.genres?.map((g) => g.id) ?? raw.genre_ids ?? [];
  if (type === "movie") return { kind: "movies", meta: movieMeta({ ...raw, genre_ids: genreIds }) };
  return { kind: showKind(genreIds), meta: seriesMeta({ ...raw, genre_ids: genreIds }) };
}

function scanTitles(
  key: string,
  scanId: string,
  type: "movie" | "tv",
  candidates: (from: number) => Promise<number[]>,
  kind: BlackBoxKind,
  want: number,
): Promise<Meta[]> {
  const scan = scanFor(scanId);
  const run = scan.queue.then(async () => {
    if (scan.kept[kind].length >= want || scan.ended) return;
    const black = await blackPeople(key);
    if (black.size === 0) return;
    while (scan.kept[kind].length < want && !scan.ended) {
      const batch = await candidates(scan.next);
      if (batch.length === 0) {
        scan.ended = true;
        break;
      }
      scan.next += batch.length;
      const found = await eachLimited(batch, (id) => keepIfStarring(key, type, id, black));
      const seen = new Set(scan.kept[kind].map((m) => m.id));
      for (const f of found) {
        if (!f || seen.has(f.meta.id)) continue;
        seen.add(f.meta.id);
        scan.kept[f.kind].push(f.meta);
      }
    }
  });
  scan.queue = run.catch(() => {});
  return run.then(() => scan.kept[kind]);
}

const BATCH = PARALLEL * 3;

let showIds: Promise<number[]> | null = null;

/** Wikidata's shows, then the named stars' own shows (from their TMDB credits) not yet among them. */
function showCandidates(key: string, wikidataShows: readonly number[]): Promise<number[]> {
  if (showIds) return showIds;
  showIds = showLists(key)
    .catch(() => ({ series: [] as TvCredit[], tv: [] as TvCredit[] }))
    .then((lists) => {
      const ids = [...wikidataShows];
      const seen = new Set(ids);
      for (const credit of [...lists.series, ...lists.tv]) {
        if (seen.has(credit.id)) continue;
        seen.add(credit.id);
        ids.push(credit.id);
      }
      return ids;
    });
  return showIds;
}

/** One page of a Black Box catalog; empty without a TMDB key or past the end. */
export async function blackBoxPage(kind: BlackBoxKind, page: number): Promise<Meta[]> {
  const key = loadStoredSettings().tmdbKey?.trim() ?? "";
  if (!key) return [];
  const from = (Math.max(1, page) - 1) * BLACK_BOX_PAGE_SIZE;
  const want = from + BLACK_BOX_PAGE_SIZE;
  const titles = await wikidataTitles(key);
  let kept: Meta[];
  if (kind === "movies") {
    // Wikidata's films, best known first; without it, TMDB's films with the named people.
    const fromWikidata = (n: number) => Promise.resolve(titles?.movie.slice(n, n + BATCH) ?? []);
    const fromTmdb = async (n: number) => {
      const ids = await peopleIds(key);
      if (ids.length === 0) return [];
      const metas = await tmdbDiscover(
        key,
        "movie",
        blackBoxMovieParams(ids, Math.floor(n / 20) + 1),
      );
      return metas.map((m) => Number(String(m.id).replace(/\D+/g, ""))).filter((id) => id > 0);
    };
    kept = await scanTitles(
      key,
      titles ? "wd-movie" : "tmdb-movie",
      "movie",
      titles ? fromWikidata : fromTmdb,
      kind,
      want,
    );
  } else if (titles) {
    // Wikidata records few TV casts (about 400 shows), so the named stars' own shows follow.
    const candidates = showCandidates(key, titles.tv);
    const fromBoth = async (n: number) => (await candidates).slice(n, n + BATCH);
    kept = await scanTitles(key, "wd-tv", "tv", fromBoth, kind, want);
  } else {
    const list = (await showLists(key))[kind];
    return list.slice(from, from + BLACK_BOX_PAGE_SIZE).map((s) => seriesMeta(s));
  }
  return kept.slice(from, want);
}

const CURATED: Record<BlackBoxCurated, { type: "movie" | "tv"; titles: readonly CuratedTitle[] }> =
  {
    "classics-90s": { type: "movie", titles: CLASSICS_90S },
    "decade-2000s": { type: "movie", titles: DECADE_2000S },
    "decade-2010s": { type: "movie", titles: DECADE_2010S },
    "decade-2020s": { type: "movie", titles: DECADE_2020S },
    "new-2026-movies": { type: "movie", titles: NEW_2026_MOVIES },
    "new-2026-shows": { type: "tv", titles: NEW_2026_SHOWS },
  };

const curatedLists = new Map<BlackBoxCurated, Promise<Meta[]>>();

/** A hand-picked collection, in its own order, each title matched on TMDB once per session. */
function curatedList(key: string, id: BlackBoxCurated): Promise<Meta[]> {
  const cached = curatedLists.get(id);
  if (cached) return cached;
  const { type, titles } = CURATED[id];
  const list = eachLimited(titles, async (want) => {
    type Hit = (RawMovie & RawSeries) & { popularity?: number };
    const data = await get<{ results?: Hit[] }>(key, `search/${type}`, {
      query: want.title,
      include_adult: "false",
    }).catch(() => null);
    const hit = pickCurated(want, data?.results ?? []);
    if (!hit?.poster_path) return null;
    return type === "movie" ? movieMeta(hit) : seriesMeta(hit);
  }).then((metas) => metas.filter((m): m is Meta => m !== null));
  curatedLists.set(id, list);
  // Matched again next time when TMDB didn't answer at all.
  void list.then((l) => {
    if (l.length === 0 && curatedLists.get(id) === list) curatedLists.delete(id);
  });
  return list;
}

/** One page of any Black Box catalog: the Black-led catalogs or a hand-picked collection. */
export async function blackBoxCatalogPage(id: BlackBoxCatalogId, page: number): Promise<Meta[]> {
  if (isBlackBoxKind(id)) return blackBoxPage(id, page);
  const key = loadStoredSettings().tmdbKey?.trim() ?? "";
  if (!key) return [];
  const from = (Math.max(1, page) - 1) * BLACK_BOX_PAGE_SIZE;
  return (await curatedList(key, id)).slice(from, from + BLACK_BOX_PAGE_SIZE);
}

/** The Black Box's catalogs in Catalogs' shape, or none without a TMDB key. */
export function blackBoxCatalogs() {
  return blackBoxCatalogsFor(!!loadStoredSettings().tmdbKey?.trim());
}
