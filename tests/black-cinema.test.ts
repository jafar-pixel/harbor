import assert from "node:assert/strict";
import test from "node:test";
import {
  BLACK_CINEMA_ROWS,
  blackCinemaSections,
  inTab,
  isBlackHistoryMonth,
  isReleased,
  onYourIptv,
  type BlackCinemaTitle,
} from "../src/lib/black-cinema-core.ts";

let next = 1;
function title(over: Partial<BlackCinemaTitle>): BlackCinemaTitle {
  return {
    id: next++,
    title: "T",
    release_year: 2020,
    media_type: "movie",
    categories: [],
    networks: [],
    franchise: null,
    genres: [],
    tmdb_id: next,
    imdb_id: null,
    poster_path: "/p.jpg",
    backdrop_path: "/b.jpg",
    overview: null,
    release_date: null,
    popularity: 1,
    vote_average: null,
    streaming_providers: [],
    ...over,
  };
}

const today = new Date("2026-11-24T12:00:00Z");

test("black cinema: the owner's 30 rows, in order", () => {
  assert.equal(BLACK_CINEMA_ROWS.length, 30);
  assert.equal(BLACK_CINEMA_ROWS[0].title, "New Black Movies — 2026");
  assert.equal(BLACK_CINEMA_ROWS[29].title, "Coming Soon");
});

test("black cinema: Top Ten is the ten best known titles already out", () => {
  const titles = [
    ...Array.from({ length: 12 }, (_, i) => title({ title: `M${i}`, popularity: i })),
    title({ title: "Unreleased", popularity: 999, release_year: 2026, release_date: "2026-12-25" }),
  ];
  const { topTen } = blackCinemaSections(titles, "all", today);
  assert.equal(topTen.length, 10);
  assert.equal(topTen[0].title, "M11");
  assert.ok(!topTen.some((t) => t.title === "Unreleased"));
});

test("black cinema: Coming Soon is what isn't out yet, soonest first", () => {
  const titles = [
    title({ title: "Later", release_year: 2027, release_date: "2027-02-01" }),
    title({ title: "Sooner", release_year: 2026, release_date: "2026-12-05" }),
    title({ title: "Out", release_year: 2026, release_date: "2026-03-01" }),
  ];
  const soon = blackCinemaSections(titles, "all", today).rows.find((r) => r.id === "coming-soon")!;
  assert.deepEqual(
    soon.items.map((t) => t.title),
    ["Sooner", "Later"],
  );
  assert.equal(isReleased(titles[2], today), true);
});

test("black cinema: tabs narrow to movies, shows, classics and 2026", () => {
  const movie = title({ media_type: "movie", release_year: 2010 });
  const show = title({ media_type: "series", release_year: 2015 });
  const classic = title({ release_year: 1992, categories: ["Black Cinema — 1990s Classics"] });
  const new2026 = title({ release_year: 2026 });
  assert.equal(inTab(movie, "movies"), true);
  assert.equal(inTab(show, "movies"), false);
  assert.equal(inTab(show, "shows"), true);
  assert.equal(inTab(classic, "classics"), true);
  assert.equal(inTab(movie, "classics"), false);
  assert.equal(inTab(new2026, "2026"), true);
});

test("black cinema: franchises are grouped, each in release order", () => {
  const titles = [
    title({ title: "Bad Boys II", release_year: 2003, franchise: "Bad Boys", popularity: 9 }),
    title({ title: "Bad Boys", release_year: 1995, franchise: "Bad Boys", popularity: 5 }),
    title({ title: "Friday", release_year: 1995, franchise: "Friday", popularity: 3 }),
  ];
  const row = blackCinemaSections(titles, "all", today).rows.find((r) => r.id === "franchises")!;
  assert.deepEqual(
    row.items.map((t) => t.title),
    ["Bad Boys", "Bad Boys II", "Friday"],
  );
});

test("black cinema: titles without a poster stay out of the rows", () => {
  const titles = [
    title({ title: "No art", poster_path: null, categories: ["Black Documentaries"] }),
    title({ title: "Art", categories: ["Black Documentaries"] }),
  ];
  const row = blackCinemaSections(titles, "all", today).rows.find((r) => r.id === "documentaries")!;
  assert.deepEqual(
    row.items.map((t) => t.title),
    ["Art"],
  );
});

test("black cinema: Black History Month is February", () => {
  assert.equal(isBlackHistoryMonth(new Date(2027, 1, 1)), true);
  assert.equal(isBlackHistoryMonth(new Date(2027, 1, 28)), true);
  assert.equal(isBlackHistoryMonth(new Date(2027, 2, 1)), false);
  assert.equal(isBlackHistoryMonth(new Date(2027, 0, 31)), false);
});

test("black cinema: On Your IPTV is what the provider's library carries", () => {
  const byId = title({ title: "Sinners", release_year: 2025, tmdb_id: 1233413, popularity: 50 });
  const byName = title({
    title: "Love & Basketball",
    release_year: 2000,
    tmdb_id: 1,
    popularity: 9,
  });
  const show = title({ title: "Insecure", media_type: "series", release_year: 2016, tmdb_id: 2 });
  const missing = title({ title: "Not Carried", release_year: 2010, tmdb_id: 3 });
  const movie = (t: string, year: number | null, tmdbId?: number) => ({
    id: t,
    title: t,
    year,
    logo: null,
    group: null,
    url: "http://x",
    playlistId: "p",
    playlistName: "P",
    tmdbId,
  });
  const libraries = [
    {
      movies: [movie("Sinners (2025) 4K", 2025, 1233413), movie("Love and Basketball", 2000)],
      series: [
        {
          id: "s",
          title: "Insecure",
          logo: null,
          group: null,
          playlistId: "p",
          playlistName: "P",
          episodes: [],
          seasons: [1],
          year: 2016,
        },
      ],
    },
  ];
  assert.deepEqual(
    onYourIptv([byId, byName, show, missing], libraries).map((t) => t.title),
    ["Sinners", "Love & Basketball", "Insecure"],
  );
  assert.deepEqual(onYourIptv([byId], [{ movies: [], series: [] }]), []);
});

test("black cinema: a 100,000-film provider catalog is matched quickly, not scanned per title", () => {
  const titles = Array.from({ length: 940 }, (_, i) =>
    title({ title: `Hub Film ${i}`, release_year: 2000 + (i % 25), tmdb_id: 500_000 + i }),
  );
  const movies = Array.from({ length: 100_000 }, (_, i) => ({
    id: `m${i}`,
    title: `Provider Film ${i}`,
    year: 2000 + (i % 25),
    logo: null,
    group: null,
    url: "http://x",
    playlistId: "p",
    playlistName: "P",
    // Providers rarely carry TMDB ids: the title is what has to be compared.
    tmdbId: undefined as number | undefined,
  }));
  movies.push({ ...movies[0], id: "hit", title: "Hub Film 7", year: 2007 });
  const started = performance.now();
  const found = onYourIptv(titles, [{ movies, series: [] }]);
  const ms = performance.now() - started;
  assert.deepEqual(
    found.map((t) => t.title),
    ["Hub Film 7"],
  );
  assert.ok(ms < 3000, `took ${Math.round(ms)} ms`);
});
