import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeExperiences,
  validBirthday,
  isBirthday,
  holidayInSeason,
  holidayOccurrence,
  moveExperience,
  gameIsToday,
  isPostseason,
} from "../src/lib/experiences/catalog.ts";
import type { SportsGame } from "../src/lib/sports/espn.ts";

test("birthday uses month/day and validates leap day without a birth year", () => {
  assert.equal(validBirthday("02-29"), true);
  for (const value of ["02-30", "00-01", "13-01", "10-00", "2020-10-23", "1-1"])
    assert.equal(validBirthday(value), false);
  assert.equal(isBirthday("10-23", new Date(2026, 9, 23)), true);
  assert.equal(isBirthday("02-29", new Date(2027, 1, 28)), false);
  assert.equal(isBirthday("02-29", new Date(2028, 1, 29)), true);
});
test("holiday windows cross New Year and end on their holiday", () => {
  assert.equal(holidayInSeason("new-year", new Date(2026, 11, 31)), true);
  assert.equal(holidayInSeason("new-year", new Date(2027, 0, 1)), true);
  assert.equal(holidayInSeason("new-year", new Date(2027, 0, 2)), false);
  assert.equal(holidayInSeason("christmas", new Date(2026, 11, 25)), true);
  assert.equal(holidayInSeason("christmas", new Date(2026, 11, 26)), false);
  assert.equal(
    holidayOccurrence("new-year", new Date(2026, 11, 31)),
    holidayOccurrence("new-year", new Date(2027, 0, 1)),
  );
});
test("Thanksgiving follows the fourth Thursday rather than a fixed date", () => {
  assert.equal(holidayInSeason("thanksgiving", new Date(2026, 10, 26)), true);
  assert.equal(holidayInSeason("thanksgiving", new Date(2027, 10, 25)), true);
  assert.equal(holidayInSeason("thanksgiving", new Date(2026, 10, 18)), false);
});
test("explicit off switches and empty holidays remain off after normalization", () => {
  const prefs = normalizeExperiences({
    enabled: { gameday: false, birthday: false, spooktober: false },
    holidays: [],
  });
  assert.equal(prefs.enabled.gameday, false);
  assert.equal(prefs.enabled.birthday, false);
  assert.equal(prefs.enabled.spooktober, false);
  assert.deepEqual(prefs.holidays, []);
});
test("stored order normalizes unknown IDs and duplicates while adding new plugins", () => {
  const prefs = normalizeExperiences({
    order: ["holidays", "unknown", "holidays"],
    birthday: "02-30",
    dismissed: ["gameday:2026-10-23", 4],
  });
  assert.equal(prefs.order[0], "holidays");
  assert.equal(prefs.order.length, 5);
  assert.equal(prefs.birthday, "");
  assert.deepEqual(prefs.dismissed, ["gameday:2026-10-23"]);
});
test("profile preferences are independent and defaults are not mutated", () => {
  const a = normalizeExperiences({ birthday: "10-23", enabled: { gameday: false } });
  const b = normalizeExperiences(undefined);
  a.order.reverse();
  a.holidays.length = 0;
  a.enabled.birthday = false;
  assert.equal(b.birthday, "");
  assert.equal(b.enabled.gameday, true);
  assert.equal(b.enabled.birthday, true);
  assert.equal(normalizeExperiences(undefined).order[0], "birthday");
  assert.equal(b.holidays.length, 3);
});
test("remote-friendly ordering stays within its boundaries", () => {
  const original = normalizeExperiences(undefined).order;
  assert.deepEqual(moveExperience(original, original[0], -1), original);
  assert.equal(moveExperience(original, "gameday", -1)[0], "gameday");
  assert.equal(original[0], "birthday");
});
test("game day includes only today's fixtures or games currently live", () => {
  const today = new Date(2026, 9, 23, 12);
  const game = { state: "pre", startMs: new Date(2026, 9, 24, 15).getTime() } as SportsGame;
  assert.equal(gameIsToday(game, today), false);
  assert.equal(gameIsToday({ ...game, dateOnly: "2026-10-23" }, today), true);
  assert.equal(gameIsToday({ ...game, state: "in" }, today), true);
});
test("postseason banners require an actual postseason event", () => {
  const game = {
    detail: "Scheduled",
    context: { name: "Regular season", round: "" },
  } as SportsGame;
  assert.equal(isPostseason(game), false);
  assert.equal(isPostseason({ ...game, detail: "CFP Quarterfinal - Rose Bowl" }), true);
  assert.equal(isPostseason({ ...game, detail: "NBA Playoffs" }), true);
});
