import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SPORTS_HOME_ORDER,
  sportsHomeOrder,
  sportsHomeHidden,
  moveSportsShelf,
} from "../src/lib/sports/home-layout.ts";

test("Top 10 precedes live channel cards in a fresh layout", () => {
  const order = sportsHomeOrder(undefined);
  assert.ok(order.indexOf("top10") < order.indexOf("channel-cards"));
});
test("stored order is preserved while unknown and duplicate shelves are removed", () => {
  const order = sportsHomeOrder(["scores", "removed", "scores", "top10"]);
  assert.deepEqual(order.slice(0, 2), ["scores", "top10"]);
  assert.equal(order.length, DEFAULT_SPORTS_HOME_ORDER.length);
  assert.equal(new Set(order).size, order.length);
});
test("an explicitly empty hidden list shows every shelf, rather than restoring defaults", () => {
  assert.deepEqual(sportsHomeHidden([]), []);
  assert.deepEqual(sportsHomeHidden(["scores", "scores", "removed"]), ["scores"]);
});
test("remote-friendly shelf moves preserve all shelves and respect boundaries", () => {
  const order = sportsHomeOrder(undefined);
  assert.equal(moveSportsShelf(order, order[0], -1), order);
  const moved = moveSportsShelf(order, "channel-cards", -1);
  assert.equal(moved.indexOf("channel-cards"), order.indexOf("channel-cards") - 1);
  assert.deepEqual([...moved].sort(), [...order].sort());
});
