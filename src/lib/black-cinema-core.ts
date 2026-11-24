/**
 * Black Cinema hub: the pure parts. Which titles make the hub's sections (Top Ten, Trending, New
 * Movies, New Shows, Classics, Coming Soon), its 30 rows and its tabs, and when Black History Month
 * puts the hub on Home. The titles themselves come from public.black_cinema_titles (black-cinema.ts),
 * filled in from the master list in supabase/jl-vision/black-cinema.
 */

export type BlackCinemaTitle = {
  id: number;
  title: string;
  release_year: number;
  media_type: "movie" | "series";
  categories: string[];
  networks: string[];
  franchise: string | null;
  genres: string[];
  tmdb_id: number | null;
  imdb_id: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  release_date: string | null;
  popularity: number | null;
  vote_average: number | null;
  streaming_providers: string[];
};

export type BlackCinemaTab = "all" | "movies" | "shows" | "classics" | "2026";

export const BLACK_CINEMA_TABS: ReadonlyArray<{ id: BlackCinemaTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "movies", label: "Movies" },
  { id: "shows", label: "TV Shows" },
  { id: "classics", label: "Classics" },
  { id: "2026", label: "2026 Releases" },
];

/** The owner's 30 rows, in order. `category` is the list section or tag a row reads. */
export const BLACK_CINEMA_ROWS: ReadonlyArray<{ id: string; title: string; category?: string }> = [
  { id: "new-2026", title: "New Black Movies — 2026", category: "New Black Movies — 2026" },
  { id: "trending-tv", title: "Trending Black TV Shows" },
  {
    id: "1990s",
    title: "Black Cinema — 1990s Classics",
    category: "Black Cinema — 1990s Classics",
  },
  { id: "2000s", title: "Black Cinema — 2000s", category: "Black Cinema — 2000s" },
  { id: "2010s", title: "Black Cinema — 2010s", category: "Black Cinema — 2010s" },
  { id: "2020s", title: "Black Cinema — 2020s", category: "Black Cinema — 2020s" },
  { id: "bet", title: "BET & BET+ Originals", category: "BET & BET+ Originals" },
  { id: "allblk", title: "ALLBLK Originals", category: "ALLBLK Originals" },
  { id: "tubi", title: "Tubi Black Cinema", category: "Tubi Black Cinema" },
  { id: "starz", title: "Starz Black Entertainment", category: "Starz Black Entertainment" },
  { id: "own", title: "OWN Original Series", category: "OWN Original Series" },
  { id: "crime", title: "Black Crime & Urban Drama", category: "Black Crime & Urban Drama" },
  {
    id: "romance",
    title: "Black Romance & Relationships",
    category: "Black Romance & Relationships",
  },
  { id: "sitcoms", title: "Classic Black Sitcoms", category: "Classic Black Sitcoms" },
  { id: "sports", title: "Black Sports Cinema", category: "Black Sports Cinema" },
  { id: "history", title: "Black History & Biographies", category: "Black History & Biographies" },
  {
    id: "horror",
    title: "Black Horror & Science Fiction",
    category: "Black Horror & Science Fiction",
  },
  { id: "action", title: "Black Action & Thrillers", category: "Black Action & Thrillers" },
  { id: "independent", title: "Black Independent Cinema", category: "Black Independent Cinema" },
  { id: "tyler-perry", title: "Tyler Perry Collection", category: "Tyler Perry Collection" },
  { id: "spike-lee", title: "Spike Lee Collection", category: "Spike Lee Collection" },
  { id: "family", title: "Black Family Entertainment", category: "Black Family Entertainment" },
  { id: "music", title: "Black Music & Hip-Hop", category: "Black Music & Hip-Hop" },
  {
    id: "african-caribbean",
    title: "African & Caribbean Cinema",
    category: "African & Caribbean Cinema",
  },
  {
    id: "holiday",
    title: "Black Christmas & Holiday Movies",
    category: "Black Christmas & Holiday Movies",
  },
  { id: "hbcu", title: "HBCU Movies & Television", category: "HBCU Movies & Television" },
  { id: "documentaries", title: "Black Documentaries", category: "Black Documentaries" },
  { id: "stand-up", title: "Black Stand-Up Comedy", category: "Black Stand-Up Comedy" },
  { id: "franchises", title: "Black Movie Franchises", category: "Black Movie Franchises" },
  { id: "coming-soon", title: "Coming Soon" },
];

const byPopularity = (a: BlackCinemaTitle, b: BlackCinemaTitle) =>
  (b.popularity ?? 0) - (a.popularity ?? 0) || b.release_year - a.release_year;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Out already: a release date on or before today, or (without one) a year before this one. */
export function isReleased(t: BlackCinemaTitle, today: Date): boolean {
  if (t.release_date) return t.release_date <= isoDay(today);
  return t.release_year < today.getUTCFullYear();
}

export function isClassic(t: BlackCinemaTitle): boolean {
  return t.release_year < 2000 || t.categories.includes("Black Cinema — 1990s Classics");
}

/** The titles a tab shows. */
export function inTab(t: BlackCinemaTitle, tab: BlackCinemaTab): boolean {
  switch (tab) {
    case "movies":
      return t.media_type === "movie";
    case "shows":
      return t.media_type === "series";
    case "classics":
      return isClassic(t);
    case "2026":
      return t.release_year === 2026 || t.categories.includes("New Black Movies — 2026");
    default:
      return true;
  }
}

export type BlackCinemaSections = {
  topTen: BlackCinemaTitle[];
  trending: BlackCinemaTitle[];
  newMovies: BlackCinemaTitle[];
  newShows: BlackCinemaTitle[];
  classics: BlackCinemaTitle[];
  rows: Array<{ id: string; title: string; items: BlackCinemaTitle[] }>;
  featured: BlackCinemaTitle[];
};

const MAX_ROW = 40;

/**
 * Every section of the hub for a tab. Top Ten and Trending rank by TMDB popularity (refreshed every
 * few days); New Movies and New Shows are the latest released; Classics are pre-2000 and the 90s
 * classics; Coming Soon is what isn't out yet. Rows keep only titles with a poster.
 */
export function blackCinemaSections(
  all: readonly BlackCinemaTitle[],
  tab: BlackCinemaTab,
  today: Date,
): BlackCinemaSections {
  const titles = all.filter((t) => t.poster_path && inTab(t, tab));
  const released = titles.filter((t) => isReleased(t, today));
  const thisYear = today.getUTCFullYear();
  const recent = (years: number) => (t: BlackCinemaTitle) => t.release_year >= thisYear - years;
  const byDate = (a: BlackCinemaTitle, b: BlackCinemaTitle) =>
    (b.release_date ?? `${b.release_year}`).localeCompare(a.release_date ?? `${a.release_year}`);

  const topTen = [...released].sort(byPopularity).slice(0, 10);
  const trending = released.filter(recent(4)).sort(byPopularity).slice(0, MAX_ROW);
  const newMovies = released
    .filter((t) => t.media_type === "movie" && recent(2)(t))
    .sort(byDate)
    .slice(0, MAX_ROW);
  const newShows = released
    .filter(
      (t) =>
        t.media_type === "series" &&
        (recent(2)(t) || t.categories.includes("Trending Black TV Shows")),
    )
    .sort(byPopularity)
    .slice(0, MAX_ROW);
  const classics = titles.filter(isClassic).sort(byPopularity).slice(0, MAX_ROW);

  const rows = BLACK_CINEMA_ROWS.map((row) => {
    let items: BlackCinemaTitle[];
    if (row.id === "trending-tv") {
      items = released.filter((t) => t.media_type === "series").sort(byPopularity);
    } else if (row.id === "coming-soon") {
      items = titles
        .filter((t) => !isReleased(t, today))
        .sort(byDate)
        .reverse();
    } else if (row.id === "franchises") {
      // Grouped by franchise, the best known franchise first, each in release order.
      const groups = new Map<string, BlackCinemaTitle[]>();
      for (const t of titles) {
        if (!t.franchise) continue;
        groups.set(t.franchise, [...(groups.get(t.franchise) ?? []), t]);
      }
      items = [...groups.values()]
        .sort(
          (a, b) =>
            Math.max(...b.map((t) => t.popularity ?? 0)) -
            Math.max(...a.map((t) => t.popularity ?? 0)),
        )
        .flatMap((g) => g.sort((a, b) => a.release_year - b.release_year));
    } else {
      items = titles.filter((t) => t.categories.includes(row.category!)).sort(byPopularity);
    }
    return {
      id: row.id,
      title: row.title,
      items: items.slice(0, row.id === "franchises" ? 80 : MAX_ROW),
    };
  }).filter((row) => row.items.length > 0);

  // New & Featured: the newest well-known titles with artwork wide enough for the hero.
  const featured = released
    .filter((t) => t.backdrop_path && recent(2)(t))
    .sort(byPopularity)
    .slice(0, 8);

  return { topTen, trending, newMovies, newShows, classics, rows, featured };
}

/** February: Black History Month, when the hub takes over Home. */
export function isBlackHistoryMonth(today: Date): boolean {
  return today.getMonth() === 1;
}
