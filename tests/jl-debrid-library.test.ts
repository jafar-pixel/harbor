import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLibraryRows,
  classifyEntry,
  countLibraryKinds,
  debridMetaId,
  describeRelease,
  filterLibraryRows,
  libraryFileChoices,
  pageLibraryRows,
  searchMatcher,
} from "../src/lib/debrid/library-view.ts";
import type { LibraryEntry } from "../src/lib/debrid/types.ts";

const entry = (over: Partial<LibraryEntry> & { name: string }): LibraryEntry => ({
  slug: "rd",
  id: over.name,
  hash: "",
  ...over,
});

test("Debrid library: movies, shows and everything else", () => {
  assert.equal(classifyEntry({ name: "The.Matrix.1999.1080p.BluRay.x264-GROUP" }).kind, "movie");
  assert.equal(classifyEntry({ name: "Breaking.Bad.S01.COMPLETE.1080p.WEB-DL" }).kind, "show");
  assert.equal(classifyEntry({ name: "Show.Name.S02E05.720p.HDTV.x264" }).kind, "show");
  assert.equal(classifyEntry({ name: "Breaking Bad Season 1-5 Complete" }).kind, "show");
  assert.equal(
    classifyEntry({ name: "[SubsPlease] Frieren - 12 (1080p) [ABCD1234].mkv" }).kind,
    "show",
  );
  assert.equal(classifyEntry({ name: "Ubuntu-22.04-desktop-amd64.iso" }).kind, "other");
  assert.equal(classifyEntry({ name: "Some Album FLAC 2019" }).kind, "other");
  assert.equal(
    classifyEntry({
      name: "Collection 2020",
      files: [{ id: "1", name: "a.pdf", size: 1 }],
    }).kind,
    "other",
  );
});

test("Debrid library: parsed title and year", () => {
  const c = classifyEntry({ name: "Planet.Earth.II.2016.2160p.UHD.BluRay" });
  assert.equal(c.title, "Planet Earth II");
  assert.equal(c.year, 2016);
  assert.equal(
    classifyEntry({ name: "[SubsPlease] Frieren - 12 (1080p)" }).title.startsWith("["),
    false,
  );
});

test("Debrid library: substring and /regex/ search", () => {
  const rows = buildLibraryRows([
    entry({ name: "The.Matrix.1999.1080p.BluRay" }),
    entry({ name: "Matrix.Reloaded.2003.720p" }),
    entry({ name: "Dune.2021.2160p" }),
  ]);
  assert.equal(rows.filter(searchMatcher("the matrix")).length, 1);
  assert.equal(rows.filter(searchMatcher("MATRIX")).length, 2);
  assert.equal(rows.filter(searchMatcher("/^dune/")).length, 1);
  assert.equal(rows.filter(searchMatcher("/(19|20)0\\d/")).length, 1);
  assert.equal(rows.filter(searchMatcher("/[unclosed/")).length, 0);
  assert.equal(rows.filter(searchMatcher("  ")).length, 3);
});

test("Debrid library: provider and kind filters, newest first", () => {
  const rows = buildLibraryRows([
    entry({ name: "Old.Movie.1980.720p", added: 1_000 }),
    entry({ name: "Show.S01E01.1080p", slug: "tb", id: "7", added: 3_000 }),
    entry({ name: "New.Movie.2024.1080p", added: 2_000 }),
    entry({ name: "Undated.Movie.2001.1080p" }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.entry.name),
    [
      "Show.S01E01.1080p",
      "New.Movie.2024.1080p",
      "Old.Movie.1980.720p",
      "Undated.Movie.2001.1080p",
    ],
  );
  assert.equal(filterLibraryRows(rows, { search: "", kind: "all", provider: "tb" }).length, 1);
  assert.equal(filterLibraryRows(rows, { search: "", kind: "movie", provider: "rd" }).length, 3);
  assert.equal(
    filterLibraryRows(rows, { search: "movie", kind: "show", provider: "all" }).length,
    0,
  );
  assert.deepEqual(countLibraryKinds(rows), { all: 4, movie: 3, show: 1, other: 0 });
  assert.notEqual(
    rows[0].key,
    buildLibraryRows([entry({ name: "Show.S01E01.1080p", id: "7" })])[0].key,
  );
});

test("Debrid library: pages of 100", () => {
  const rows = buildLibraryRows(
    Array.from({ length: 250 }, (_, i) => entry({ name: `Movie.${i}.2000.1080p`, id: String(i) })),
  );
  const first = pageLibraryRows(rows, 1);
  assert.equal(first.rows.length, 100);
  assert.equal(first.pages, 3);
  assert.equal(first.total, 250);
  const last = pageLibraryRows(rows, 9);
  assert.equal(last.page, 3);
  assert.equal(last.rows.length, 50);
  assert.equal(pageLibraryRows([], 1).pages, 1);
  assert.equal(pageLibraryRows(rows, 0).page, 1);
});

test("Debrid library: file choices keep the client's fileIdx", () => {
  const tb = libraryFileChoices([
    { id: "10", name: "Pack/S01E02.mkv", size: 2 },
    { id: "11", name: "Pack/info.nfo", size: 1 },
    { id: "12", name: "Pack/S01E01.mkv", size: 2 },
  ]);
  assert.deepEqual(
    tb.map((c) => c.fileIdx),
    [2, 0],
  );
  const rd = libraryFileChoices([
    { id: "3", name: "E10.mkv", size: 1, fileIdx: 2 },
    { id: "5", name: "E9.mkv", size: 1, fileIdx: 4 },
  ]);
  assert.deepEqual(
    rd.map((c) => c.fileIdx),
    [4, 2],
  );
  assert.deepEqual(
    libraryFileChoices([{ id: "1", name: "readme.txt", size: 1 }]).map((c) => c.fileIdx),
    [0],
  );
});

test("Debrid library: episode and quality from a file path", () => {
  assert.deepEqual(describeRelease("Pack/Show.S02E05.1080p.WEB-DL.mkv"), {
    season: 2,
    episode: 5,
    label: "1080p web-dl",
  });
  assert.deepEqual(describeRelease("Movie.mkv"), { season: null, episode: null, label: null });
});

test("Debrid library: synthetic ids stay out of the cloud id schemes", () => {
  const id = debridMetaId({ slug: "rd", hash: "abc", id: "X" });
  assert.equal(id, "debrid:rd:abc");
  assert.equal(/^(tt\d|kitsu:|mal:|anilist:|anidb:|tmdb:)/.test(id), false);
  assert.equal(debridMetaId({ slug: "tb", hash: "", id: "9" }), "debrid:tb:9");
});
