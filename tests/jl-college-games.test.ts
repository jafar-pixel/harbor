// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  collegeFavorite,
  collegeForEspnTeam,
  collegeGames,
  collegeIdOfGame,
  collegeShortName,
  linkCollegesToVision,
  mergeSchoolGames,
  streamProvider,
} from "../src/lib/jl/sports/college-games.ts";
import type { College } from "../src/lib/jl/sports/colleges.ts";
import type { SportsGame } from "../src/lib/sports/espn-types.ts";
import type { SchoolEvent } from "../src/lib/jl/sports/sidearm.ts";
import type { VisionTeam } from "../src/lib/jl/sports/vision-branding.ts";

const GALLAUDET: College = {
  id: "ncaa:255",
  name: "Gallaudet University",
  division: "III",
  subdivision: null,
  conference: "SCAC",
  state: "DC",
  site: "gallaudetbison.example.com",
  hbcu: false,
};

const event = (over: Partial<SchoolEvent>): SchoolEvent => ({
  id: "e1",
  sport: "Football",
  sportId: null,
  start: "2026-10-10T17:00:00.000Z",
  allDay: false,
  title: "",
  opponent: "Hendrix",
  home: true,
  location: null,
  result: null,
  score: null,
  stream: null,
  url: null,
  ...over,
});

test("short names and the followed-team entry", () => {
  assert.equal(collegeShortName("Gallaudet University"), "Gallaudet");
  assert.equal(collegeShortName("University of Chicago"), "Chicago");
  assert.deepEqual(collegeFavorite(GALLAUDET), {
    league: "NCAAF",
    id: "ncaa-255",
    name: "Gallaudet",
  });
});

test("football events become hub games: home/away, final scores, on now", () => {
  const now = Date.parse("2026-10-10T18:00:00Z");
  const games = collegeGames(
    GALLAUDET,
    [
      event({ id: "a" }),
      event({
        id: "b",
        start: "2026-10-03T17:00:00Z",
        home: false,
        result: "W",
        score: "35-14",
        opponent: "Lyon",
      }),
      event({ id: "c", start: "2026-10-17T17:00:00Z" }),
      event({ id: "d", sport: "Women's Soccer" }),
    ],
    now,
    { mascot: "Bison", logo: "https://gallaudetbison.example.com/logo.png" },
  );
  assert.deepEqual(
    games.map((g) => [g.id, g.state]),
    [
      ["school:ncaa:255:a", "in"],
      ["school:ncaa:255:b", "post"],
      ["school:ncaa:255:c", "pre"],
    ],
  );
  const final = games[1];
  assert.equal(final.away.id, "ncaa-255");
  assert.equal(final.away.score, "35");
  assert.equal(final.home.score, "14");
  assert.equal(final.away.nickname, "Bison");
  assert.equal(final.away.winner, true);
  assert.equal(collegeIdOfGame(final), "ncaa:255");
  assert.equal(collegeIdOfGame({ id: "401", source: undefined }), null);
});

test("followed colleges link to their JL Vision team by name, only when unique", () => {
  const team = (slug: string, name: string): VisionTeam => ({
    key: `scac/football/${slug}`,
    conference: "scac",
    sport: "football",
    slug,
    name,
    mascot: null,
    league: "ncaa-diii",
    logoPath: null,
    providerIds: [],
  });
  const links = linkCollegesToVision(
    [GALLAUDET],
    [team("gallaudet", "Gallaudet"), team("hendrix", "Hendrix")],
  );
  assert.deepEqual(Object.fromEntries(links), { "ncaa:college:255": "scac/football/gallaudet" });
  const twice = linkCollegesToVision(
    [GALLAUDET],
    [team("gallaudet", "Gallaudet"), team("g2", "Gallaudet")],
  );
  assert.equal(twice.size, 0);
});

test("a school game carries its BoxCast stream and shows BoxCast as the network", () => {
  const url = "https://boxcast.tv/view/football-gallaudet-vs-thaddeus-stevens-ci7dwu4iyoa6hmzur833";
  const [game] = collegeGames(
    GALLAUDET,
    [event({ stream: url })],
    Date.parse("2026-10-09T00:00:00Z"),
  );
  assert.equal(game.stream, url);
  assert.equal(game.network, "BoxCast");
  assert.deepEqual(game.broadcasts, ["BoxCast"]);
  const [plain] = collegeGames(GALLAUDET, [event({})], Date.parse("2026-10-09T00:00:00Z"));
  assert.equal(plain.stream, undefined);
  assert.equal(plain.network, null);
});

test("stream hosts name their provider", () => {
  assert.equal(streamProvider("https://boxcast.tv/channel/abc"), "BoxCast");
  assert.equal(streamProvider("https://www.youtube.com/watch?v=x"), "YouTube");
  assert.equal(streamProvider("https://fan.hudl.com/usa/watch"), "Hudl");
  assert.equal(streamProvider("https://www.psucampusathletics.com/x/"), "School stream");
});

test("a followed ESPN college gets its school's games ESPN misses, and its streams", () => {
  const team = { league: "NCAAF", id: "417", name: "Gallaudet Bison" };
  const others: College[] = [
    { ...GALLAUDET, id: "ncaa:1", name: "Galloway State", site: "gsu.example.com" },
    { ...GALLAUDET, id: "ncaa:2", name: "Ohio State University", subdivision: "FBS" },
  ];
  assert.equal(collegeForEspnTeam(team, [GALLAUDET, ...others])?.id, GALLAUDET.id);
  assert.equal(collegeForEspnTeam({ ...team, name: "Ohio State Buckeyes" }, others), null);

  const now = Date.parse("2026-10-24T12:00:00Z");
  const url = "https://boxcast.tv/view/football-gallaudet-vs-thaddeus-stevens-x";
  const school = collegeGames(
    GALLAUDET,
    [
      event({
        id: "club",
        opponent: "Thaddeus Stevens (Club)",
        start: "2026-10-24T18:00:00.000Z",
        stream: url,
      }),
      event({
        id: "dean",
        opponent: "Dean College",
        start: "2026-10-10T17:00:00.000Z",
        home: false,
        stream: url,
      }),
    ],
    now,
  );
  const espnDean: SportsGame = {
    id: "401",
    league: "NCAAF",
    state: "post",
    detail: "Final",
    away: { id: "417", name: "Gallaudet Bison", abbr: "GAL", logo: "", score: "21", winner: false },
    home: { id: "9", name: "Dean College", abbr: "DEA", logo: "", score: "45", winner: true },
    startMs: Date.parse("2026-10-10T18:00:00Z"),
  };
  const merged = mergeSchoolGames([espnDean], school, [{ team, college: GALLAUDET }]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].stream, url, "ESPN's game gains the school's stream");
  const club = merged[1];
  assert.equal(club.home.id, "417", "the school game counts as the followed ESPN team's");
  assert.equal(club.stream, url);
});
