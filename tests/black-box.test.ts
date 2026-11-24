import assert from "node:assert/strict";
import test from "node:test";
import {
  BLACK_BOX_KEYWORDS,
  blackBoxCatalogsFor,
  blackBoxDiscoverParams,
  exactKeywordIds,
} from "../src/lib/black-box-core.ts";

test("black box: only exact keyword names are used, each id once", () => {
  const ids = exactKeywordIds(BLACK_BOX_KEYWORDS, [
    [
      { id: 1, name: "African American" },
      { id: 2, name: "african american history month" },
    ],
    [
      { id: 3, name: "black lead" },
      { id: 1, name: "african american" },
    ],
    [{ id: 4, name: "black hole" }],
  ]);
  assert.deepEqual(ids.sort(), [1, 3]);
});

test("black box: movies, scripted series and unscripted TV, most popular first", () => {
  const movies = blackBoxDiscoverParams("movies", [1, 3], 2);
  assert.equal(movies.type, "movie");
  assert.equal(movies.params.with_keywords, "1|3");
  assert.equal(movies.params.sort_by, "popularity.desc");
  assert.equal(movies.params.page, "2");
  assert.equal(movies.params.with_type, undefined);
  const series = blackBoxDiscoverParams("series", [1], 1);
  assert.equal(series.type, "tv");
  assert.equal(series.params.with_type, "4|2");
  const tv = blackBoxDiscoverParams("tv", [1], 0);
  assert.equal(tv.type, "tv");
  assert.equal(tv.params.with_type, "3|5|0");
  assert.equal(tv.params.page, "1");
});

test("black box: no TMDB key, no catalogs", () => {
  assert.deepEqual(blackBoxCatalogsFor(false), []);
  assert.deepEqual(
    blackBoxCatalogsFor(true).map((c) => `${c.type}:${c.id}`),
    ["movie:movies", "series:series", "tv:tv"],
  );
});
