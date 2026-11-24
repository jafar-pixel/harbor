/**
 * The Black Box's pure parts (see black-box.ts): whose work it gathers, how a TMDB person search is
 * matched to a name, how a person's TV credits split into Series and TV, and the catalogs' entries
 * in Catalogs. Nothing here reaches the network or the settings.
 */

/** The `base` of a Black Box catalog; never an addon address. */
export const BLACK_BOX_BASE = "jl-black-box";
export const BLACK_BOX_NAME = "The Black Box";

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

const CATALOGS: ReadonlyArray<{ kind: BlackBoxKind; type: string; name: string }> = [
  { kind: "movies", type: "movie", name: "Black Box Movies" },
  { kind: "series", type: "series", name: "Black Box Series" },
  { kind: "tv", type: "tv", name: "Black Box TV" },
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
