import assert from "node:assert/strict";
import test from "node:test";
import { reconcileAddons, decodeJournal, mergeAddonOps } from "../src/lib/jl/account/addon-sync.ts";
const a = (n: string) => ({
  id: n,
  transportUrl: "https://example.com/" + n + "/manifest.json",
  installedAt: 1,
});
test("first sync merges four desktop addons with one web addon", () => {
  const desktop = reconcileAddons("p", "d", [a("1"), a("2"), a("3"), a("4")], null, [], []);
  const web = reconcileAddons("p", "w", [a("1")], null, [], desktop.journal.ops);
  assert.equal(web.desired.length, 4);
  assert.equal(
    reconcileAddons(
      "p",
      "d",
      desktop.desired,
      desktop.desired,
      desktop.journal.ops,
      web.journal.ops,
    ).desired.length,
    4,
  );
});
test("simultaneous additions from different devices survive", () => {
  const d = reconcileAddons("p", "d", [a("d")], null, [], []);
  const w = reconcileAddons("p", "w", [a("w")], null, [], []);
  assert.equal(
    reconcileAddons("p", "d", d.desired, d.desired, d.journal.ops, w.journal.ops).desired.length,
    2,
  );
});
test("removals propagate without stale clients or first sync resurrecting them", () => {
  const seed = reconcileAddons("p", "d", [a("1")], null, [], []);
  const removed = reconcileAddons("p", "d", [], seed.desired, seed.journal.ops, []);
  assert.equal(removed.desired.length, 0);
  assert.equal(
    reconcileAddons("p", "w", [a("1")], [a("1")], [], removed.journal.ops).desired.length,
    0,
  );
  assert.equal(
    reconcileAddons("p", "new", [a("1")], null, [], removed.journal.ops).desired.length,
    0,
  );
  const readd = reconcileAddons("p", "w", [a("1")], [], [], removed.journal.ops);
  assert.equal(readd.desired.length, 1);
});
test("merge is deterministic regardless of response order", () => {
  const d = reconcileAddons("p", "d", [a("1")], null, [], []).journal.ops;
  const w = reconcileAddons("p", "w", [a("1")], null, [], []).journal.ops;
  assert.deepEqual(mergeAddonOps([...d, ...w]), mergeAddonOps([...w, ...d]));
});
test("malformed and wrong-profile journals fail closed", () => {
  assert.throws(() => decodeJournal('{"version":1,"profileId":"other","ops":[]}', "p"));
  assert.throws(() =>
    decodeJournal(
      JSON.stringify({
        version: 1,
        profileId: "p",
        ops: [{ addon: a("1"), clock: -1, removed: false, writer: "d" }],
      }),
      "p",
    ),
  );
});
