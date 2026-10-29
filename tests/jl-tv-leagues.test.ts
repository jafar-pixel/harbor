import assert from "node:assert/strict";
import test from "node:test";
import { tvLeagueOf } from "../src/lib/jl/sports/tv-leagues.ts";

const of = (group: string, name: string, title = name, sport = "other" as const) =>
  tvLeagueOf({ group, name, title }, sport);

test("provider groups decide the league", () => {
  assert.equal(of("USA NCAAF", "NCAAF 01: Kennesaw State at Middle Tennessee"), "NCAAF");
  assert.equal(of("US| NBA PASS PPV 8K", "LIVE | IND - PACERS VS PHI - 76ERS"), "NBA");
  assert.equal(of("USA NFL - Sunday Ticket", "USA NFL Red Zone LHD"), "NFL");
  assert.equal(of("US| NCAAB PPV", "Duke vs UNC"), "NCAAB");
  assert.equal(of("USA WNBA", "Aces vs Liberty"), "WNBA");
  assert.equal(of("US| MLS PPV", "LAFC vs Galaxy"), "Soccer");
});

test("a general sports group falls back to the channel name, then the sport", () => {
  assert.equal(of("USA Sports", "USA NBA TV UHD"), "NBA");
  assert.equal(
    tvLeagueOf({ group: "USA Sports", name: "USA ESPN HD", title: "USA ESPN HD" }, "other"),
    "More sports",
  );
  assert.equal(
    tvLeagueOf({ group: "UK Sports", name: "Sky Sports F1", title: "Sky Sports F1" }, "racing"),
    "Racing",
  );
});
