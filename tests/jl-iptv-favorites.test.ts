import assert from "node:assert/strict";
import test from "node:test";
import { mergeIptvFavorites } from "../src/lib/jl/account/iptv-favorites.ts";

const f = (id: string) => ({ id, name: id });
const ids = (list: { id: string }[]) => list.map((x) => x.id).sort();

test("first sync on a device keeps both sides", () => {
  assert.deepEqual(ids(mergeIptvFavorites(null, [f("tv")], [f("pc")])), ["pc", "tv"]);
});

test("a favorite removed here since the last sync leaves the account", () => {
  assert.deepEqual(ids(mergeIptvFavorites(["a", "b"], [f("a")], [f("a"), f("b")])), ["a"]);
});

test("a favorite added on another device arrives here", () => {
  assert.deepEqual(ids(mergeIptvFavorites(["a"], [f("a")], [f("a"), f("c")])), ["a", "c"]);
});

test("a favorite removed on another device leaves here too", () => {
  assert.deepEqual(ids(mergeIptvFavorites(["a", "b"], [f("a"), f("b")], [f("a")])), ["a"]);
});
