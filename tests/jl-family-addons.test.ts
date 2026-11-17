import assert from "node:assert/strict";
import test from "node:test";
import { planFamilyAddons } from "../src/lib/jl/account/family-addons-plan.ts";

const A = {
  id: "torrentio",
  transportUrl: "https://torrentio.example/rd=x/manifest.json",
  installedAt: 1,
};
const B = { id: "comet", transportUrl: "https://comet.example/abc/manifest.json", installedAt: 2 };
const MINE = "https://my-own.example/manifest.json";

test("a member gets the owner's shared add-ons", () => {
  const plan = planFamilyAddons([MINE], [A, B], []);
  assert.deepEqual(
    plan.install.map((a) => a.id),
    ["torrentio", "comet"],
  );
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.added, [A.transportUrl, B.transportUrl]);
});

test("nothing to do when the shared add-ons are already there", () => {
  const plan = planFamilyAddons([MINE, A.transportUrl], [A], [A.transportUrl]);
  assert.equal(plan.install.length, 0);
  assert.equal(plan.remove.length, 0);
});

test("stopping sharing removes only what the family added", () => {
  const plan = planFamilyAddons(
    [MINE, A.transportUrl, B.transportUrl],
    [],
    [A.transportUrl, B.transportUrl],
  );
  assert.deepEqual(plan.remove, [A.transportUrl, B.transportUrl]);
  assert.deepEqual(plan.added, []);
  assert.ok(!plan.remove.includes(MINE), "the member's own add-on stays");
});

test("an add-on the member already had is never taken away", () => {
  // The member installed A themselves before the owner shared it: it was not added by the family.
  const plan = planFamilyAddons([A.transportUrl], [A], []);
  assert.equal(plan.install.length, 0);
  const after = planFamilyAddons([A.transportUrl], [], plan.added);
  assert.deepEqual(after.remove, [], "still the member's own");
});
