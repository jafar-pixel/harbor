/**
 * The Black Box's pure parts (see black-box.ts): which TMDB keywords, which filters per catalog,
 * and the catalogs' entries in Catalogs. Nothing here reaches the network or the settings.
 */
/** The `base` of a Black Box catalog; never an addon address. */
export const BLACK_BOX_BASE = "jl-black-box";
export const BLACK_BOX_NAME = "The Black Box";

export type BlackBoxKind = "movies" | "series" | "tv";

/** TMDB keyword names that mark a Black-led or African American title. */
export const BLACK_BOX_KEYWORDS = [
  "african american",
  "african american lead",
  "black lead",
  "black cinema",
  "black family",
  "black woman",
  "black culture",
  "black history",
  "harlem renaissance",
  "hbcu",
] as const;

// TMDB's show types: scripted and miniseries are Series; reality, talk shows and documentaries
// are TV.
const SERIES_TYPES = "4|2";
const TV_TYPES = "3|5|0";

/** At least this many votes: drops near-empty entries that only carry a keyword. */
const MIN_VOTES = "25";

const CATALOGS: ReadonlyArray<{ kind: BlackBoxKind; type: string; name: string }> = [
  { kind: "movies", type: "movie", name: "Black Box Movies" },
  { kind: "series", type: "series", name: "Black Box Series" },
  { kind: "tv", type: "tv", name: "Black Box TV" },
];

export type KeywordHit = { id: number; name: string };

/** Keeps the ids of exact name matches from TMDB's keyword search results. */
export function exactKeywordIds(
  wanted: readonly string[],
  results: ReadonlyArray<readonly KeywordHit[]>,
): number[] {
  const names = new Set(wanted.map((w) => w.toLowerCase()));
  const ids = new Set<number>();
  for (const hits of results) {
    for (const hit of hits) {
      if (typeof hit?.id === "number" && names.has(String(hit.name).trim().toLowerCase()))
        ids.add(hit.id);
    }
  }
  return [...ids];
}

/** The discover filters for one Black Box catalog, given the keyword ids. */
export function blackBoxDiscoverParams(
  kind: BlackBoxKind,
  ids: readonly number[],
  page: number,
): { type: "movie" | "tv"; params: Record<string, string> } {
  const params: Record<string, string> = {
    with_keywords: ids.join("|"),
    sort_by: "popularity.desc",
    "vote_count.gte": MIN_VOTES,
    include_adult: "false",
    page: String(Math.max(1, page)),
  };
  if (kind === "movies") return { type: "movie", params };
  return {
    type: "tv",
    params: { ...params, with_type: kind === "series" ? SERIES_TYPES : TV_TYPES },
  };
}

export function isBlackBoxKind(id: string): id is BlackBoxKind {
  return id === "movies" || id === "series" || id === "tv";
}

/** The Black Box's entries in Catalogs, or none when there is no TMDB key to list them with. */
export function blackBoxCatalogsFor(hasTmdbKey: boolean): Array<{
  key: string;
  addonName: string;
  base: string;
  type: string;
  id: string;
  name: string;
  genreExtra: null;
  genres: string[];
}> {
  if (!hasTmdbKey) return [];
  return CATALOGS.map((c) => ({
    key: `${BLACK_BOX_BASE}-${c.kind}`,
    addonName: BLACK_BOX_NAME,
    base: BLACK_BOX_BASE,
    type: c.type,
    id: c.kind,
    name: c.name,
    genreExtra: null,
    genres: [],
  }));
}
