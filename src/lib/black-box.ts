/**
 * The Black Box: JL's own catalogs of Black film and television (Movies, Series, TV), named Black
 * Box beside the addons' catalogs in Catalogs and Discover's catalog picker. They gather
 * the work of the Black actors, actresses and hosts in BLACK_BOX_PEOPLE from TMDB, with the
 * viewer's TMDB key (Settings); without a key there is nothing to show.
 *
 * The titles come from Wikidata: every film and show whose cast includes a person Wikidata records
 * as Black (BLACK_BOX_GROUPS) or one of BLACK_BOX_PEOPLE, best known first, thousands of them; TMDB
 * supplies each page's posters and details. When Wikidata can't be reached, TMDB alone is used:
 * Movies from its discover (any of the people in the cast), Series and TV from the people's TV
 * credits. Who each name is on TMDB is looked up by exact name once and kept on the device.
 */
import type { Meta } from "./cinemeta";
import {
  BLACK_BOX_PAGE_SIZE,
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
import { loadStoredSettings } from "./settings/load";

export { BLACK_BOX_BASE, isBlackBoxKind } from "./black-box-core";

const PEOPLE_STORE = "jl.blackBox.people.v1";
/** TMDB lookups at once: quick on a TV without tripping TMDB's rate limit. */
const PARALLEL = 6;

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
const WIKIDATA_STORE = "jl.blackBox.wikidata.v1";
const WIKIDATA_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** Fewer titles than this from Wikidata means it didn't really answer; TMDB alone is used then. */
const WIKIDATA_ENOUGH = 100;

type WikidataStore = { at: number; movie: number[]; tv: number[] };

function readWikidata(): WikidataStore | null {
  try {
    const raw = localStorage.getItem(WIKIDATA_STORE);
    const parsed = raw ? (JSON.parse(raw) as WikidataStore) : null;
    if (!parsed || Date.now() - parsed.at > WIKIDATA_FRESH_MS) return null;
    return Array.isArray(parsed.movie) && Array.isArray(parsed.tv) ? parsed : null;
  } catch {
    return null;
  }
}

function writeWikidata(store: WikidataStore): void {
  try {
    localStorage.setItem(WIKIDATA_STORE, JSON.stringify(store));
  } catch {}
}

async function askWikidata(kind: "movie" | "tv", people: readonly number[]): Promise<number[]> {
  const url = `${WIKIDATA}?format=json&query=${encodeURIComponent(blackBoxSparql(kind, people))}`;
  const res = await safeFetch(url, { headers: { Accept: "application/sparql-results+json" } });
  if (!res.ok) return [];
  return blackBoxIdsFromSparql(await res.json());
}

let wikidata: Promise<WikidataStore | null> | null = null;

/**
 * Every film and show with a Black actor or actress in the cast, from Wikidata, best known first:
 * thousands of titles. Kept on the device for a week; null when Wikidata can't be reached.
 */
function wikidataTitles(key: string): Promise<WikidataStore | null> {
  if (wikidata) return wikidata;
  const stored = readWikidata();
  if (stored) return (wikidata = Promise.resolve(stored));
  const run = (async () => {
    const people = await peopleIds(key).catch(() => [] as number[]);
    const [movie, tv] = await Promise.all([
      askWikidata("movie", people).catch(() => [] as number[]),
      askWikidata("tv", people).catch(() => [] as number[]),
    ]);
    if (movie.length + tv.length < WIKIDATA_ENOUGH) return null;
    const store = { at: Date.now(), movie, tv };
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

type Details = { poster_path?: string | null; adult?: boolean; genres?: Array<{ id: number }> };

async function movieDetails(key: string, id: number): Promise<Meta | null> {
  const raw = await get<RawMovie & Details>(key, `movie/${id}`).catch(() => null);
  if (!raw?.id || !raw.poster_path || raw.adult) return null;
  return movieMeta({ ...raw, genre_ids: raw.genres?.map((g) => g.id) ?? raw.genre_ids });
}

type ShowScan = { next: number; series: Meta[]; tv: Meta[]; queue: Promise<void> };
let showScan: { ids: number[]; scan: ShowScan } | null = null;

/**
 * Shows are split into Series and TV by their genres, which only their details carry, so both
 * catalogs read through the same list in order, a batch at a time, until the one asked for has
 * `want` titles or the list ends.
 */
function scanShows(
  key: string,
  ids: number[],
  kind: "series" | "tv",
  want: number,
): Promise<Meta[]> {
  if (showScan?.ids !== ids) {
    showScan = { ids, scan: { next: 0, series: [], tv: [], queue: Promise.resolve() } };
  }
  const scan = showScan.scan;
  const run = scan.queue.then(async () => {
    while (scan[kind].length < want && scan.next < ids.length) {
      const batch = ids.slice(scan.next, scan.next + PARALLEL * 2);
      scan.next += batch.length;
      const shows = await eachLimited(batch, (id) =>
        get<RawSeries & Details>(key, `tv/${id}`).catch(() => null),
      );
      for (const raw of shows) {
        if (!raw?.id || !raw.poster_path || raw.adult) continue;
        const genreIds = raw.genres?.map((g) => g.id) ?? raw.genre_ids ?? [];
        scan[showKind(genreIds)].push(seriesMeta({ ...raw, genre_ids: genreIds }));
      }
    }
  });
  scan.queue = run.catch(() => {});
  return run.then(() => scan[kind]);
}

/** One page of a Black Box catalog; empty without a TMDB key or past the end. */
export async function blackBoxPage(kind: BlackBoxKind, page: number): Promise<Meta[]> {
  const key = loadStoredSettings().tmdbKey?.trim() ?? "";
  if (!key) return [];
  const p = Math.max(1, page);
  const from = (p - 1) * BLACK_BOX_PAGE_SIZE;
  const titles = await wikidataTitles(key);
  if (kind === "movies") {
    if (titles && titles.movie.length > 0) {
      const ids = titles.movie.slice(from, from + BLACK_BOX_PAGE_SIZE);
      const metas = await eachLimited(ids, (id) => movieDetails(key, id));
      return metas.filter((m): m is Meta => m !== null);
    }
    const ids = await peopleIds(key);
    if (ids.length === 0) return [];
    return tmdbDiscover(key, "movie", blackBoxMovieParams(ids, p));
  }
  if (titles && titles.tv.length > 0) {
    const shown = await scanShows(key, titles.tv, kind, from + BLACK_BOX_PAGE_SIZE);
    return shown.slice(from, from + BLACK_BOX_PAGE_SIZE);
  }
  const list = (await showLists(key))[kind];
  return list.slice(from, from + BLACK_BOX_PAGE_SIZE).map((s) => seriesMeta(s));
}

/** The Black Box's catalogs in Catalogs' shape, or none without a TMDB key. */
export function blackBoxCatalogs() {
  return blackBoxCatalogsFor(!!loadStoredSettings().tmdbKey?.trim());
}
