/**
 * The Black Box: JL's own catalogs of Black film and television (Movies, Series, TV), the Home
 * page's main feature: its hero and the rows under it (views/home/use-black-box.ts). They gather
 * the work of the Black actors, actresses and hosts in BLACK_BOX_PEOPLE from TMDB, with the
 * viewer's TMDB key (Settings); without a key there is nothing to show.
 *
 * Movies page through TMDB's discover (any of the people in the cast). Series and TV come from each
 * person's TV credits, gathered once per session and split by black-box-core's rules. Who each name
 * is on TMDB is looked up by exact name once and kept on the device.
 */
import type { Meta } from "./cinemeta";
import {
  BLACK_BOX_PAGE_SIZE,
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
import { seriesMeta } from "./providers/tmdb/tmdb-meta-mappers";
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

/** One page of a Black Box catalog; empty without a TMDB key or past the end. */
export async function blackBoxPage(kind: BlackBoxKind, page: number): Promise<Meta[]> {
  const key = loadStoredSettings().tmdbKey?.trim() ?? "";
  if (!key) return [];
  if (kind === "movies") {
    const ids = await peopleIds(key);
    if (ids.length === 0) return [];
    return tmdbDiscover(key, "movie", blackBoxMovieParams(ids, page));
  }
  const list = (await showLists(key))[kind];
  const from = (Math.max(1, page) - 1) * BLACK_BOX_PAGE_SIZE;
  return list.slice(from, from + BLACK_BOX_PAGE_SIZE).map((s) => seriesMeta(s));
}
