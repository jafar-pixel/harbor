import assert from "node:assert/strict";
import test from "node:test";
import type { SportsGame } from "../src/lib/sports/espn-types.ts";
import { detectSportsEvents } from "../src/lib/experiences/sports-events.ts";

const side = (name: string, extra: Partial<SportsGame["home"]> = {}): SportsGame["home"] => ({
  id: name,
  name,
  abbr: name.slice(0, 3),
  logo: "",
  score: "",
  winner: false,
  ...extra,
});
const game = (league: string, extra: Partial<SportsGame> = {}): SportsGame => ({
  id: `${league}-${Math.random()}`,
  league,
  state: "pre",
  detail: "",
  home: side("Home"),
  away: side("Away"),
  startMs: Date.parse("2026-10-24T23:00:00Z"),
  ...extra,
});
const saturday = new Date("2026-10-24T18:00:00");
const sunday = new Date("2026-10-25T18:00:00");
const wednesday = new Date("2026-10-28T18:00:00");

test("World Series games turn the World Series on", () => {
  const ws = game("MLB", { headline: "World Series - Game 2", postseason: true, state: "in" });
  const events = detectSportsEvents([game("MLB"), ws], wednesday);
  assert.deepEqual(
    events.map((e) => e.id),
    ["world-series"],
  );
  assert.equal(events[0].game, ws);
});

test("Super Bowl, playoff and bowl games are told apart", () => {
  const ids = detectSportsEvents(
    [
      game("NFL", { headline: "Super Bowl LX" }),
      game("NCAAF", { headline: "College Football Playoff Semifinal at the Rose Bowl" }),
      game("NCAAF", { headline: "Duke's Mayo Bowl" }),
      game("NCAAF", { headline: "Pop-Tarts Bowl" }),
    ],
    wednesday,
  );
  assert.deepEqual(
    ids.map((e) => e.id),
    ["super-bowl", "college-playoff", "bowl-season"],
  );
  assert.equal(
    detectSportsEvents([game("NCAAF", { headline: "Duke's Mayo Bowl" })], wednesday)[0].games
      .length,
    1,
  );
});

test("NBA Finals, All-Star and the Final Four", () => {
  const ids = detectSportsEvents(
    [
      game("NBA", { headline: "NBA Finals - Game 7" }),
      game("NBA", { headline: "NBA All-Star Game" }),
      game("NCAAW", { headline: "Women's Final Four" }),
    ],
    wednesday,
  ).map((e) => e.id);
  assert.deepEqual(ids, ["nba-all-star", "nba-finals", "final-four"]);
});

test("College game of the week: Saturday's best ranked pair", () => {
  const top = game("NCAAF", { home: side("Oregon", { rank: 3 }), away: side("USC", { rank: 8 }) });
  const one = game("NCAAF", { home: side("Army", { rank: 20 }), away: side("Tulsa") });
  const none = game("NCAAF");
  const sat = detectSportsEvents([none, one, top], saturday);
  assert.equal(sat.find((e) => e.id === "college-game-of-week")?.game, top);
  assert.equal(detectSportsEvents([top], wednesday).length, 0);
  assert.equal(detectSportsEvents([none], saturday).length, 0);
});

test("NFL game of the week: Sunday's best combined record", () => {
  const best = game("NFL", {
    home: side("Chiefs", { record: "6-1" }),
    away: side("Bills", { record: "5-2" }),
  });
  const meh = game("NFL", {
    home: side("Jets", { record: "1-6" }),
    away: side("Pats", { record: "2-5" }),
  });
  assert.equal(
    detectSportsEvents([meh, best], sunday).find((e) => e.id === "nfl-game-of-week")?.game,
    best,
  );
  assert.equal(detectSportsEvents([meh], sunday).length, 0);
});

test("a live game leads its event", () => {
  const later = game("MLB", {
    headline: "World Series - Game 4",
    startMs: Date.parse("2026-10-25T00:00:00Z"),
  });
  const live = game("MLB", { headline: "World Series - Game 3", state: "in" });
  assert.equal(detectSportsEvents([later, live], wednesday)[0].game, live);
});
