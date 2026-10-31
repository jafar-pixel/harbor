import assert from "node:assert/strict";
import test from "node:test";
import { sportsRemindersAsCalendarItems } from "../src/lib/sports/reminders-calendar.ts";

const base = { leadMinutes: 15, channels: [], sent: {}, attempted: {}, failed: [] };

test("reminded games land on their local day and time in the calendar", () => {
  const startMs = new Date(2026, 10, 1, 13, 25).getTime();
  const [item] = sportsRemindersAsCalendarItems([
    {
      ...base,
      id: "espn:NFL:1",
      name: "Arizona Cardinals · Dallas Cowboys",
      league: "NFL",
      startMs,
    },
    { ...base, id: "espn:NFL:2", name: "TBD", league: "NFL", startMs, awaitingStartTime: true },
  ]);
  assert.equal(item.releaseDate, "2026-11-01");
  assert.equal(item.releaseTime, "13:25");
  assert.equal(item.sportsReminder, true);
  assert.equal(item.overview, "NFL");
});
