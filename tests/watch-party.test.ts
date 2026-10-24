import assert from "node:assert/strict";
import test from "node:test";
import type { SportsGame } from "../src/lib/sports/espn-types.ts";
import { buildWatchPartyInvite, watchPartyGame } from "../src/lib/together/watch-party.ts";

const game: SportsGame = {
  id: "401628374",
  league: "MLB",
  state: "in",
  detail: "Top 5th",
  headline: "World Series - Game 2",
  network: "FOX",
  startMs: Date.parse("2026-10-24T23:08:00Z"),
  home: {
    id: "19",
    name: "Los Angeles Dodgers",
    abbr: "LAD",
    logo: "https://a.espncdn.com/lad.png",
    score: "3",
    winner: false,
    record: "98-64",
  },
  away: {
    id: "10",
    name: "New York Yankees",
    abbr: "NYY",
    logo: "javascript:alert(1)",
    score: "2",
    winner: false,
  },
  broadcasts: ["FOX", "FS1"],
};

test("a game invite round-trips to the same game", () => {
  const invite = buildWatchPartyInvite(game);
  assert.equal(invite.mediaId, "game:MLB:401628374");
  assert.equal(invite.mediaTitle, "New York Yankees at Los Angeles Dodgers");
  const back = watchPartyGame(JSON.parse(JSON.stringify(invite)));
  assert.ok(back);
  assert.equal(back.id, game.id);
  assert.equal(back.league, "MLB");
  assert.equal(back.headline, "World Series - Game 2");
  assert.equal(back.home.name, "Los Angeles Dodgers");
});

test("only https logos travel, and nothing extra is sent", () => {
  const invite = buildWatchPartyInvite(game);
  assert.equal(invite.game?.away.logo, "");
  assert.equal(invite.posterUrl, "https://a.espncdn.com/lad.png");
  assert.equal("record" in (invite.game?.home ?? {}), false);
  assert.equal("broadcasts" in (invite.game ?? {}), false);
});

test("movie and show invites are not watch parties", () => {
  assert.equal(watchPartyGame({ mediaId: "tt0111161", mediaType: "movie", mediaTitle: "x" }), null);
  // A game snapshot only counts with its own media id.
  const invite = buildWatchPartyInvite(game);
  assert.equal(watchPartyGame({ ...invite, mediaId: "tt0111161" }), null);
});
