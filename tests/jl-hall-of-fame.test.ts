import assert from "node:assert/strict";
import test from "node:test";
import { hallFor, parseLegendSummary } from "../src/lib/jl/sports/hall-of-fame.ts";

test("a Wikipedia summary becomes a legend's story", () => {
  const story = parseLegendSummary("Jerry Rice", {
    type: "standard",
    title: "Jerry Rice",
    description: "American football player (born 1962)",
    extract: "Jerry Lee Rice is an American former professional football wide receiver...",
    thumbnail: { source: "https://upload.wikimedia.org/x.jpg" },
    content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Jerry_Rice" } },
  });
  assert.equal(story?.name, "Jerry Rice");
  assert.equal(story?.image, "https://upload.wikimedia.org/x.jpg");
  assert.equal(story?.url, "https://en.wikipedia.org/wiki/Jerry_Rice");
  assert.equal(parseLegendSummary("X", { type: "disambiguation", extract: "may refer to" }), null);
});

test("every covered league has a hall, soccer leagues share one", () => {
  assert.equal(hallFor("NFL", "football")?.hall, "Pro Football Hall of Fame");
  assert.equal(hallFor("EPL", "soccer")?.hall, "Soccer legends");
  assert.equal(hallFor("F1", "motorsport"), null);
});
