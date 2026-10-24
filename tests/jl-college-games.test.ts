// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  asSchoolFollows,
  collegeFavorite,
  collegeGames,
  collegeIdOfGame,
  collegeShortName,
  linkCollegesToVision,
  schoolForEspnTeam,
  streamProvider,
} from "../src/lib/jl/sports/college-games.ts";
import type { College } from "../src/lib/jl/sports/colleges.ts";
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

test("a Division II/III school is followed as a school, never as an ESPN team", () => {
  const espn = { league: "NCAAF", id: "417", name: "Gallaudet Bison" };
  const fbs: College = {
    ...GALLAUDET,
    id: "ncaa:2",
    name: "Ohio State University",
    division: "I",
    subdivision: "FBS",
  };
  assert.equal(schoolForEspnTeam(espn, [GALLAUDET, fbs])?.id, GALLAUDET.id);
  assert.equal(schoolForEspnTeam({ ...espn, id: "194", name: "Ohio State Buckeyes" }, [fbs]), null);
  const buckeyes = { league: "NCAAF", id: "194", name: "Ohio State Buckeyes" };
  assert.deepEqual(
    asSchoolFollows([espn, buckeyes, collegeFavorite(GALLAUDET)], [GALLAUDET, fbs]),
    [collegeFavorite(GALLAUDET), buckeyes],
  );
});
