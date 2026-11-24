/**
 * The Black Box's pure parts (see black-box.ts): whose work it gathers, how a TMDB person search is
 * matched to a name, how a person's TV credits split into Series and TV, and the catalogs' entries
 * in Catalogs. Nothing here reaches the network or the settings.
 */

/** The `base` of a Black Box catalog; never an addon address. */
export const BLACK_BOX_BASE = "jl-black-box";
export const BLACK_BOX_NAME = "Black Box";

export type BlackBoxKind = "movies" | "series" | "tv";

/**
 * Black actors, actresses, comedians and TV hosts whose film and television work the Black Box
 * gathers. Each is looked up on TMDB by exact name; a name TMDB doesn't know simply drops out.
 */
export const BLACK_BOX_PEOPLE = [
  // Actors
  "Denzel Washington",
  "Samuel L. Jackson",
  "Morgan Freeman",
  "Will Smith",
  "Jamie Foxx",
  "Eddie Murphy",
  "Idris Elba",
  "Chadwick Boseman",
  "Michael B. Jordan",
  "Don Cheadle",
  "Forest Whitaker",
  "Laurence Fishburne",
  "Wesley Snipes",
  "Ice Cube",
  "Kevin Hart",
  "Chris Rock",
  "Martin Lawrence",
  "Mahershala Ali",
  "Daniel Kaluuya",
  "John Boyega",
  "Chiwetel Ejiofor",
  "Sterling K. Brown",
  "Jeffrey Wright",
  "Danny Glover",
  "Cuba Gooding Jr.",
  "Terrence Howard",
  "Tyler Perry",
  "Omar Epps",
  "Taye Diggs",
  "Morris Chestnut",
  "Anthony Mackie",
  "Jonathan Majors",
  "LaKeith Stanfield",
  "Brian Tyree Henry",
  "Winston Duke",
  "Yahya Abdul-Mateen II",
  "Aldis Hodge",
  "Damson Idris",
  "Jharrel Jerome",
  "André Holland",
  "Trevante Rhodes",
  "Courtney B. Vance",
  "Delroy Lindo",
  "Giancarlo Esposito",
  "Keith David",
  "Bernie Mac",
  "Cedric the Entertainer",
  "Mike Epps",
  "Katt Williams",
  "Tracy Morgan",
  "Kenan Thompson",
  "Dave Chappelle",
  "Keegan-Michael Key",
  "Jordan Peele",
  "Donald Glover",
  "Tyrese Gibson",
  "Ludacris",
  "LL Cool J",
  "Common",
  "Yasiin Bey",
  "Method Man",
  "Snoop Dogg",
  "Ice-T",
  "Nick Cannon",
  "Shemar Moore",
  "Blair Underwood",
  "Boris Kodjoe",
  "Lance Gross",
  "Romany Malco",
  "Anthony Anderson",
  "Jesse Williams",
  "Regé-Jean Page",
  "Lamorne Morris",
  "Jay Ellis",
  "Jerrod Carmichael",
  "Lil Rel Howery",
  "Damon Wayans",
  "Keenen Ivory Wayans",
  "Marlon Wayans",
  "Shawn Wayans",
  "Kadeem Hardison",
  "Malcolm-Jamal Warner",
  "Jaleel White",
  "Isaiah Washington",
  "Harry Lennix",
  "Djimon Hounsou",
  "Dennis Haysbert",
  "Louis Gossett Jr.",
  "Sidney Poitier",
  "Harry Belafonte",
  "James Earl Jones",
  "Richard Pryor",
  "Ving Rhames",
  "Michael Clarke Duncan",
  "Mekhi Phifer",
  "Larenz Tate",
  "Malik Yoba",
  "Allen Payne",
  "Bokeem Woodbine",
  "Tommy Davidson",
  "Clarke Peters",
  "Wendell Pierce",
  "Andre Braugher",
  "Sinbad",
  "Omari Hardwick",
  "Michael Ealy",
  "Columbus Short",
  "Derek Luke",
  "Rob Morgan",
  "Corey Hawkins",
  "Stephan James",
  "Kelvin Harrison Jr.",
  "Caleb McLaughlin",
  "Jacob Latimore",
  "Algee Smith",
  "Glynn Turman",
  "Lamman Rucker",
  // Actresses
  "Viola Davis",
  "Angela Bassett",
  "Halle Berry",
  "Taraji P. Henson",
  "Regina King",
  "Octavia Spencer",
  "Lupita Nyong'o",
  "Zoe Saldaña",
  "Kerry Washington",
  "Gabrielle Union",
  "Sanaa Lathan",
  "Nia Long",
  "Jada Pinkett Smith",
  "Whoopi Goldberg",
  "Queen Latifah",
  "Tiffany Haddish",
  "Issa Rae",
  "Yvonne Orji",
  "Tracee Ellis Ross",
  "Thandiwe Newton",
  "Zendaya",
  "Janelle Monáe",
  "Cynthia Erivo",
  "Danai Gurira",
  "Letitia Wright",
  "Tessa Thompson",
  "KiKi Layne",
  "Teyonah Parris",
  "Uzo Aduba",
  "Danielle Brooks",
  "Niecy Nash",
  "Loretta Devine",
  "Alfre Woodard",
  "Cicely Tyson",
  "Ruby Dee",
  "Diahann Carroll",
  "Pam Grier",
  "Vivica A. Fox",
  "Jenifer Lewis",
  "Phylicia Rashad",
  "Debbie Allen",
  "Keke Palmer",
  "Aja Naomi King",
  "Naomie Harris",
  "Aunjanue Ellis-Taylor",
  "Andra Day",
  "Jennifer Hudson",
  "Mo'Nique",
  "Kimberly Elise",
  "Lynn Whitfield",
  "Regina Hall",
  "Meagan Good",
  "Paula Patton",
  "Tika Sumpter",
  "Gabourey Sidibe",
  "Amandla Stenberg",
  "Quvenzhané Wallis",
  "Yara Shahidi",
  "Marsai Martin",
  "Essence Atkins",
  "Tisha Campbell",
  "Kim Fields",
  "Tichina Arnold",
  "Holly Robinson Peete",
  "Tatyana Ali",
  "Karyn Parsons",
  "Brandy Norwood",
  "Raven-Symoné",
  "Tia Mowry",
  "Tamera Mowry",
  "Kyla Pratt",
  "Jurnee Smollett",
  "Garcelle Beauvais",
  "Gina Torres",
  "Lorraine Toussaint",
  "Nicole Ari Parker",
  "Robin Givens",
  "Jasmine Guy",
  "Dawnn Lewis",
  "Marla Gibbs",
  "Jackée Harry",
  "Della Reese",
  "Esther Rolle",
  "Isabel Sanford",
  "Ja'Net DuBois",
  "Halle Bailey",
  "Storm Reid",
  "Sheryl Lee Ralph",
  "Quinta Brunson",
  "Ayo Edebiri",
  "Coco Jones",
  "Danielle Deadwyler",
  "Lauren London",
  "Logan Browning",
  "Simone Missick",
  "Rutina Wesley",
  "Susan Kelechi Watson",
  "Chandra Wilson",
  "Sharon Leal",
  // Comedians and TV hosts
  "Oprah Winfrey",
  "Steve Harvey",
  "Tamron Hall",
  "Sherri Shepherd",
  "Wendy Williams",
  "Arsenio Hall",
  "Tyra Banks",
  "Trevor Noah",
  "Jay Pharoah",
  "RuPaul",
  "Wanda Sykes",
  "Leslie Jones",
  "Sasheer Zamata",
  "Amber Ruffin",
  "Roy Wood Jr.",
] as const;

// TMDB's genre ids for unscripted television: talk, reality, documentary, news.
const TV_GENRES = new Set([10767, 10764, 99, 10763]);

/** A long-running own show, not a guest spot on someone else's. */
const MIN_TV_EPISODES = 5;
/** A real part in a show, not a one- or two-episode visit. */
const MIN_SERIES_EPISODES = 3;

const PLAYING_THEMSELVES =
  /^(self|himself|herself|themselves|themself|host|co-host|narrator|various|guest)\b/i;

/** Lower case, no accents, letters and digits only: "Zoe Saldaña" and "Zoe Saldana" match. */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export type PersonHit = {
  id: number;
  name: string;
  known_for_department?: string;
  popularity?: number;
};

/** The TMDB person a name means: an exact name match, actors first, then the best known. */
export function pickPerson(name: string, hits: readonly PersonHit[]): number | null {
  const want = nameKey(name);
  const same = hits.filter((h) => typeof h?.id === "number" && nameKey(String(h.name)) === want);
  if (same.length === 0) return null;
  const rank = (h: PersonHit) =>
    (h.known_for_department === "Acting" ? 1_000_000 : 0) + (h.popularity ?? 0);
  return [...same].sort((a, b) => rank(b) - rank(a))[0].id;
}

export type TvCredit = {
  id: number;
  name: string;
  character?: string;
  episode_count?: number;
  genre_ids?: number[];
  popularity?: number;
  vote_count?: number;
  poster_path?: string | null;
};

/**
 * Where a person's TV credit belongs: TV for their own talk, reality or documentary show, Series for
 * a real part in a scripted show, nowhere for a guest spot or an appearance as themselves elsewhere.
 */
export function tvCreditKind(credit: TvCredit): "series" | "tv" | null {
  const episodes = credit.episode_count ?? 0;
  const unscripted = (credit.genre_ids ?? []).some((g) => TV_GENRES.has(g));
  if (unscripted) return episodes >= MIN_TV_EPISODES ? "tv" : null;
  if (PLAYING_THEMSELVES.test((credit.character ?? "").trim())) return null;
  return episodes >= MIN_SERIES_EPISODES ? "series" : null;
}

/** Every show once, best known first, with no poster-less entries. */
export function rankShows<T extends TvCredit>(credits: readonly T[]): T[] {
  const byId = new Map<number, T>();
  for (const c of credits) {
    if (!c.poster_path) continue;
    const seen = byId.get(c.id);
    if (!seen || (c.popularity ?? 0) > (seen.popularity ?? 0)) byId.set(c.id, c);
  }
  return [...byId.values()].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}

/** The movie discover filters: any of these people in the cast, best known first. */
export function blackBoxMovieParams(
  personIds: readonly number[],
  page: number,
): Record<string, string> {
  return {
    with_cast: personIds.join("|"),
    sort_by: "popularity.desc",
    "vote_count.gte": "10",
    include_adult: "false",
    page: String(Math.max(1, page)),
  };
}

export const BLACK_BOX_PAGE_SIZE = 20;

export function isBlackBoxKind(id: string): id is BlackBoxKind {
  return id === "movies" || id === "series" || id === "tv";
}

/** The hand-picked collections (black-box-curated.ts). */
export type BlackBoxCurated =
  | "new-2026-movies"
  | "new-2026-shows"
  | "decade-2020s"
  | "decade-2010s"
  | "decade-2000s"
  | "classics-90s";

const CURATED_IDS: readonly string[] = [
  "new-2026-movies",
  "new-2026-shows",
  "decade-2020s",
  "decade-2010s",
  "decade-2000s",
  "classics-90s",
];
export type BlackBoxCatalogId = BlackBoxKind | BlackBoxCurated;

export function isBlackBoxCatalogId(id: string): id is BlackBoxCatalogId {
  return isBlackBoxKind(id) || CURATED_IDS.includes(id);
}

const CATALOGS: ReadonlyArray<{ kind: BlackBoxCatalogId; type: string; name: string }> = [
  { kind: "movies", type: "movie", name: "Black Box" },
  { kind: "series", type: "series", name: "Black Box" },
  { kind: "tv", type: "tv", name: "Black Box" },
  { kind: "new-2026-movies", type: "movie", name: "Black Box: New in 2026" },
  { kind: "new-2026-shows", type: "series", name: "Black Box: New in 2026" },
  { kind: "decade-2020s", type: "movie", name: "Black Box: 2020s" },
  { kind: "decade-2010s", type: "movie", name: "Black Box: 2010s" },
  { kind: "decade-2000s", type: "movie", name: "Black Box: 2000s" },
  { kind: "classics-90s", type: "movie", name: "Black Box: 90s Classics" },
];

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

/**
 * Wikidata's English names for the ethnic groups (property P172) that put a person in the Black
 * Box. Matched by name rather than by item id; a name Wikidata doesn't use simply matches no one.
 */
export const BLACK_BOX_GROUPS = [
  "African Americans",
  "Black people",
  "Black British people",
  "Black Canadians",
  "Afro-Caribbean people",
  "Afro-Latin Americans",
  "Afro-Brazilians",
  "Afro-Cubans",
  "Afro-Puerto Ricans",
  "Nigerian Americans",
  "Jamaican Americans",
  "Haitian Americans",
  "Ghanaian Americans",
  "Ethiopian Americans",
  "Black Africans",
] as const;

// Wikidata properties: cast member, ethnic group, and the TMDB ids of a person, film and show.
const CAST = "wdt:P161";
const ETHNIC_GROUP = "wdt:P172";
const TMDB_PERSON = "wdt:P4985";
const TMDB_ID = { movie: "wdt:P4947", tv: "wdt:P4983" } as const;

const sparqlString = (s: string) => `"${s.replace(/["\\]/g, "")}"`;

/**
 * A Wikidata query for every film (or show) with a TMDB id whose cast includes a person of one of
 * BLACK_BOX_GROUPS or one of `tmdbPeople`, each with its Wikipedia link count: how widely known it
 * is, the order the catalog shows them in.
 */
export function blackBoxSparql(kind: "movie" | "tv", tmdbPeople: readonly number[]): string {
  const groups = BLACK_BOX_GROUPS.map((g) => `${sparqlString(g)}@en`).join(" ");
  const people = tmdbPeople.map((id) => sparqlString(String(id))).join(" ");
  const named = people ? `UNION { VALUES ?pid { ${people} } ?person ${TMDB_PERSON} ?pid . }` : "";
  return [
    "SELECT ?tmdb (MAX(?links) AS ?n) WHERE {",
    `  { VALUES ?label { ${groups} } ?group rdfs:label ?label . ?person ${ETHNIC_GROUP} ?group . }`,
    `  ${named}`,
    `  ?work ${CAST} ?person ; ${TMDB_ID[kind]} ?tmdb ; wikibase:sitelinks ?links .`,
    "} GROUP BY ?tmdb ORDER BY DESC(?n) LIMIT 20000",
  ].join("\n");
}

/** TMDB ids from a Wikidata answer, best known first, each once. */
export function blackBoxIdsFromSparql(json: unknown): number[] {
  const rows = (json as { results?: { bindings?: unknown[] } })?.results?.bindings;
  if (!Array.isArray(rows)) return [];
  const scored: Array<[number, number]> = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const r = row as { tmdb?: { value?: string }; n?: { value?: string } };
    const id = Number(r.tmdb?.value);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    scored.push([id, Number(r.n?.value) || 0]);
  }
  return scored.sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** TMDB's genre ids on a show's details: unscripted ones make it TV, the rest Series. */
export function showKind(genreIds: readonly number[]): "series" | "tv" {
  return genreIds.some((g) => TV_GENRES.has(g)) ? "tv" : "series";
}

/** A title is Black Box when a Black actor or actress is among its first this-many billed. */
export const LEAD_BILLING = 3;

/** A Wikidata query for the TMDB ids of every person of one of BLACK_BOX_GROUPS. */
export function blackBoxPeopleSparql(): string {
  const groups = BLACK_BOX_GROUPS.map((g) => `${sparqlString(g)}@en`).join(" ");
  return [
    "SELECT DISTINCT ?pid WHERE {",
    `  VALUES ?label { ${groups} } ?group rdfs:label ?label .`,
    `  ?person ${ETHNIC_GROUP} ?group ; ${TMDB_PERSON} ?pid .`,
    "} LIMIT 50000",
  ].join("\n");
}

/** TMDB person ids from Wikidata's answer to blackBoxPeopleSparql. */
export function personIdsFromSparql(json: unknown): number[] {
  const rows = (json as { results?: { bindings?: unknown[] } })?.results?.bindings;
  if (!Array.isArray(rows)) return [];
  const ids = new Set<number>();
  for (const row of rows) {
    const id = Number((row as { pid?: { value?: string } }).pid?.value);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

export type BilledCast = { id: number; order?: number };

/**
 * Whether a title stars a Black actor or actress: one of its first LEAD_BILLING billed cast
 * members is in `black`. A Black actor further down the cast doesn't make a blockbuster Black Box.
 */
export function starsBlackLead(
  cast: readonly BilledCast[] | undefined,
  black: ReadonlySet<number>,
): boolean {
  if (!cast?.length) return false;
  const billed = [...cast].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  return billed.slice(0, LEAD_BILLING).some((c) => black.has(c.id));
}
