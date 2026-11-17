import assert from "node:assert/strict";
import test from "node:test";
import { secretName, settingKeyFromSecret } from "../src/lib/jl/account/keys.ts";

test("followed sports travel as the viewer's own settings, never the family's", () => {
  assert.equal(secretName("sportsFavourites"), "own:sportsFavourites");
  assert.equal(secretName("sportsColleges"), "own:sportsColleges");
  assert.equal(settingKeyFromSecret("own:sportsFavourites"), "sportsFavourites");
  assert.equal(settingKeyFromSecret("own:sportsColleges"), "sportsColleges");
  // A family owner's follows (a "setting:" secret) are not taken as this viewer's.
  assert.equal(settingKeyFromSecret("setting:sportsFavourites"), null);
});

test("names an app version doesn't know are skipped, so older apps keep syncing", () => {
  assert.equal(settingKeyFromSecret("own:somethingNewer"), null);
});
