import assert from "node:assert/strict";
import test from "node:test";
import {
  BLACK_BOX_PEOPLE,
  blackBoxCatalogsFor,
  blackBoxPeopleSparql,
  personIdsFromSparql,
  starsBlackLead,
  blackBoxIdsFromSparql,
  blackBoxSparql,
  showKind,
  blackBoxMovieParams,
  nameKey,
  pickPerson,
  rankShows,
  tvCreditKind,
} from "../src/lib/black-box-core.ts";

test("black box: a long list of people, each once", () => {
  assert.ok(BLACK_BOX_PEOPLE.length >= 200);
  assert.equal(new Set(BLACK_BOX_PEOPLE.map(nameKey)).size, BLACK_BOX_PEOPLE.length);
});

test("black box: a name means its exact match on TMDB, the actor first", () => {
  assert.equal(nameKey("Zoe Saldaña"), nameKey("Zoe Saldana"));
  assert.equal(nameKey("Lupita Nyong'o"), "lupitanyongo");
  const hits = [
    { id: 1, name: "Common", known_for_department: "Directing", popularity: 50 },
    { id: 2, name: "Common", known_for_department: "Acting", popularity: 20 },
    { id: 3, name: "Common Sense", known_for_department: "Acting", popularity: 90 },
  ];
  assert.equal(pickPerson("Common", hits), 2);
  assert.equal(pickPerson("Somebody Else", hits), null);
});

test("black box: own shows count, guest spots don't", () => {
  // A part in a scripted show.
  assert.equal(
    tvCreditKind({ id: 1, name: "Insecure", character: "Issa", episode_count: 44 }),
    "series",
  );
  // A two-episode visit.
  assert.equal(
    tvCreditKind({ id: 2, name: "A Drama", character: "Doctor", episode_count: 2 }),
    null,
  );
  // Playing themselves in a scripted show.
  assert.equal(
    tvCreditKind({ id: 3, name: "A Sitcom", character: "Herself", episode_count: 6 }),
    null,
  );
  // Their own talk show.
  assert.equal(
    tvCreditKind({
      id: 4,
      name: "Own Talk Show",
      character: "Host",
      episode_count: 900,
      genre_ids: [10767],
    }),
    "tv",
  );
  // A guest spot on someone else's talk show.
  assert.equal(
    tvCreditKind({
      id: 5,
      name: "Late Night",
      character: "Self",
      episode_count: 3,
      genre_ids: [10767],
    }),
    null,
  );
});

test("black box: each show once, best known first, posters only", () => {
  const ranked = rankShows([
    { id: 1, name: "A", popularity: 5, poster_path: "/a.jpg" },
    { id: 2, name: "B", popularity: 50, poster_path: "/b.jpg" },
    { id: 1, name: "A", popularity: 9, poster_path: "/a.jpg" },
    { id: 3, name: "C", popularity: 99, poster_path: null },
  ]);
  assert.deepEqual(
    ranked.map((s) => [s.id, s.popularity]),
    [
      [2, 50],
      [1, 9],
    ],
  );
});

test("black box: movies with any of the people, most popular first", () => {
  const params = blackBoxMovieParams([10, 20, 30], 3);
  assert.equal(params.with_cast, "10|20|30");
  assert.equal(params.sort_by, "popularity.desc");
  assert.equal(params.page, "3");
});

test("black box: catalogs only with a TMDB key", () => {
  assert.deepEqual(blackBoxCatalogsFor(false), []);
  assert.deepEqual(
    blackBoxCatalogsFor(true).map((c) => `${c.type}:${c.id}`),
    ["movie:movies", "series:series", "tv:tv"],
  );
});

test("black box: Wikidata is asked for films with a Black cast member and a TMDB id", () => {
  const q = blackBoxSparql("movie", [287, 5292]);
  assert.match(q, /"African Americans"@en/);
  assert.match(q, /wdt:P172/);
  assert.match(q, /wdt:P161/);
  assert.match(q, /wdt:P4947/);
  assert.match(q, /VALUES \?pid \{ "287" "5292" \}/);
  assert.match(blackBoxSparql("tv", []), /wdt:P4983/);
  assert.doesNotMatch(blackBoxSparql("tv", []), /\?pid/);
});

test("black box: Wikidata's answer becomes TMDB ids, best known first, each once", () => {
  const ids = blackBoxIdsFromSparql({
    results: {
      bindings: [
        { tmdb: { value: "10" }, n: { value: "5" } },
        { tmdb: { value: "20" }, n: { value: "80" } },
        { tmdb: { value: "10" }, n: { value: "90" } },
        { tmdb: { value: "tt0001" }, n: { value: "99" } },
      ],
    },
  });
  assert.deepEqual(ids, [20, 10]);
  assert.deepEqual(blackBoxIdsFromSparql(null), []);
});

test("black box: talk, reality and documentary shows are TV, the rest Series", () => {
  assert.equal(showKind([18, 35]), "series");
  assert.equal(showKind([10767]), "tv");
  assert.equal(showKind([99, 18]), "tv");
});

test("black box: a title counts only when a Black actor or actress is a lead", () => {
  const black = new Set([7, 8]);
  // A Black lead, billed second.
  assert.equal(
    starsBlackLead(
      [
        { id: 1, order: 0 },
        { id: 7, order: 1 },
      ],
      black,
    ),
    true,
  );
  // A blockbuster with a Black actor far down the cast: not Black Box.
  assert.equal(
    starsBlackLead(
      [
        { id: 1, order: 0 },
        { id: 2, order: 1 },
        { id: 3, order: 2 },
        { id: 8, order: 9 },
      ],
      black,
    ),
    false,
  );
  // Billing order decides, not the order the list arrives in.
  assert.equal(
    starsBlackLead(
      [
        { id: 8, order: 5 },
        { id: 1, order: 0 },
        { id: 2, order: 1 },
        { id: 3, order: 2 },
      ],
      black,
    ),
    false,
  );
  assert.equal(starsBlackLead(undefined, black), false);
});

test("black box: Wikidata is asked who is Black, by ethnic group, with their TMDB ids", () => {
  const q = blackBoxPeopleSparql();
  assert.match(q, /"African Americans"@en/);
  assert.match(q, /wdt:P172/);
  assert.match(q, /wdt:P4985/);
  assert.deepEqual(
    personIdsFromSparql({
      results: {
        bindings: [{ pid: { value: "287" } }, { pid: { value: "287" } }, { pid: { value: "x" } }],
      },
    }),
    [287],
  );
});
