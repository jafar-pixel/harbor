// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  parseBoxScore,
  parseOpponentHistory,
  parseScheduleLinks,
  parseStory,
} from "../src/lib/jl/sports/sidearm.ts";
import { BOX_SCORE, OPPONENT_HISTORY, SCHEDULE_GAME } from "./fixtures/sidearm/gallaudet-pages.ts";

const SITE = "gallaudetbison.com";

test("a schedule entry gives the opponent's logo and site and the game's links", () => {
  const links = parseScheduleLinks(SCHEDULE_GAME, SITE);
  assert.deepEqual(links.get("6583"), {
    gameId: "6583",
    opponentLogo: "https://gallaudetbison.com/images/logos/dean.png?width=160&height=160&mode=max",
    opponentSite: "https://www.deanbulldogs.com/landing/index",
    boxScore: "https://gallaudetbison.com/sports/football/stats/2026/dean/boxscore/6583",
    recap: "https://gallaudetbison.com/news/2026/10/10/fb-26-recap-dean.aspx",
    photos:
      "https://www.davidsinclairphotography.com/gallery-collection/10-10-26-Football-at-Dean/C0000abc",
    history: "https://gallaudetbison.com/sports/football/opponent-history/dean-college/38",
  });
  const upcoming = links.get("6585");
  assert.equal(upcoming?.opponentSite, "https://stevenscollege.edu/");
  assert.equal(upcoming?.boxScore, null);
});

test("a box score gives the line score, scoring plays and team statistics", () => {
  const box = parseBoxScore(BOX_SCORE);
  assert.ok(box);
  assert.deepEqual(box.teams, ["Gallaudet", "Dean"]);
  assert.deepEqual(box.periods, ["1st", "2nd", "3rd", "4th", "Total"]);
  assert.deepEqual(box.lines, [
    ["0", "7", "6", "8", "21"],
    ["14", "10", "14", "7", "45"],
  ]);
  assert.equal(box.scoring.length, 1);
  assert.equal(box.scoring[0].period, "1st");
  assert.equal(box.scoring[0].home, "7");
  assert.match(box.scoring[0].play, /^DEAN - Tay Sholtz 37 yd pass/);
  assert.deepEqual(box.stats, [
    { group: "First Downs", label: "Total", away: "23", home: "29" },
    { group: "Rushing", label: "Total (Net)", away: "160", home: "84" },
  ]);
  assert.equal(parseBoxScore("<html>no box score</html>"), null);
});

test("opponent history gives the series numbers", () => {
  const history = parseOpponentHistory(OPPONENT_HISTORY);
  assert.ok(history);
  assert.match(history.title, /^Football History vs Roanoke College/);
  assert.deepEqual(history.items, [
    { label: "Wins", value: "0" },
    { label: "Losses", value: "2" },
    { label: "Streak", value: "L2" },
  ]);
});

test("a recap page gives its headline and summary", () => {
  const story = parseStory(
    `<meta property="og:title" content="Bison fall at Dean 45-21"><meta property="og:description" content="Gallaudet scored three times in the second half."><meta property="og:image" content="https://gallaudetbison.com/images/2026/10/10/x.jpg">`,
  );
  assert.deepEqual(story, {
    title: "Bison fall at Dean 45-21",
    summary: "Gallaudet scored three times in the second half.",
    image: "https://gallaudetbison.com/images/2026/10/10/x.jpg",
  });
});
