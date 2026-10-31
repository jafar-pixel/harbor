import assert from "node:assert/strict";
import test from "node:test";
import type { EpgIndex, EpgProgram, IptvChannel } from "../src/lib/iptv/types.ts";
import type { SportsGame, SportsSide } from "../src/lib/sports/espn.ts";
import {
  buildSportsChannelIndex,
  channelQuality,
  qualityLabel,
  channelsForGame,
  networkChannel,
  networkChannels,
  foreignFeed,
  isSdChannel,
  channelQualityOf,
} from "../src/lib/jl/sports/channels.ts";

function ch(id: string, name: string, group = "", tvgId: string | null = null): IptvChannel {
  return {
    id,
    tvgId,
    name,
    logo: null,
    group,
    url: `http://example.test/${id}`,
    catchupSource: null,
    durationSec: null,
    attrs: {},
  };
}

function side(name: string, extra: Partial<SportsSide> = {}): SportsSide {
  return { name, abbr: "", logo: "", score: "", winner: false, ...extra };
}

function program(
  tvgId: string,
  title: string,
  startIso: string,
  hours: number,
  description = "",
): EpgProgram {
  const startMs = Date.parse(startIso);
  return {
    channelTvgId: tvgId,
    title,
    description,
    startMs,
    endMs: startMs + hours * 3600000,
    category: null,
    iconUrl: null,
  };
}

function epgOf(programs: EpgProgram[]): EpgIndex {
  const byChannel = new Map<string, EpgProgram[]>();
  for (const p of programs)
    byChannel.set(p.channelTvgId, [...(byChannel.get(p.channelTvgId) ?? []), p]);
  return { byChannel, fetchedAt: 0 };
}

const NOW = new Date("2026-09-26T16:30:00Z");

const CHANNELS = [
  ch("e1", "NCAAF 03: #1 Texas vs. #14 Tennessee @ 26 Sep 12:00 PM ET", "USA NCAAF"),
  ch(
    "e2",
    "USA ESPN+ 019: NCAA Football: #1 Texas vs. #14 Tennessee (ESP) (2026-09-26 12:00:05)",
    "ESPN Events",
  ),
  ch("e3", "NCAAF 06: Bucknell vs. Pittsburgh @ 26 Sep 12:00 PM ET", "USA NCAAF"),
  ch("abc", "US: ABC HD", "USA Entertainment", "abc.us"),
  ch("espn", "US: ESPN HD", "USA Sports", "espn.us"),
  ch("espn-news", "US: ESPN NEWS", "USA Sports", "espnews.us"),
  ch("espn2", "US: ESPN 2", "USA Sports", "espn2.us"),
  ch("nfln", "USA NFL NETWORK *", "USA Sports", "nfln.us"),
  ch("snp", "US: SportsNet Philadelphia", "USA Regional", "snp.us"),
  ch("snp-backup", "US: SportsNet Philadelphia Backup", "USA Regional", "snp.us"),
];

test("event channels match by kickoff and a shared team; Spanish feed goes after the network", () => {
  const index = buildSportsChannelIndex(CHANNELS, null, NOW);
  const game: SportsGame = {
    id: "1",
    league: "NCAAF",
    state: "in",
    detail: "",
    away: side("Texas Longhorns", { location: "Texas" }),
    home: side("Tennessee Volunteers", { location: "Tennessee" }),
    startMs: Date.parse("2026-09-26T16:00:00Z"),
    network: "ABC",
  };
  const found = channelsForGame(game, index, NOW);
  assert.deepEqual(
    found.map((c) => [c.channel.id, c.via, c.alternate]),
    [
      ["abc", "network", false],
      ["e1", "event", false],
      ["e2", "event", true],
    ],
  );
});

test("a different kickoff is a different game", () => {
  const index = buildSportsChannelIndex(CHANNELS, null, NOW);
  const game: SportsGame = {
    id: "2",
    league: "NCAAF",
    state: "pre",
    detail: "",
    away: side("Texas Longhorns", { location: "Texas" }),
    home: side("Oklahoma Sooners", { location: "Oklahoma" }),
    startMs: Date.parse("2026-10-10T19:30:00Z"),
  };
  assert.deepEqual(channelsForGame(game, index, NOW), []);
});

test("network matching: plain channel beats spin-offs; aliases; streaming-only has no channel", () => {
  const index = buildSportsChannelIndex(CHANNELS, null, NOW);
  assert.equal(networkChannel("ESPN", index)?.id, "espn");
  assert.equal(networkChannel("ESPN2", index)?.id, "espn2");
  assert.equal(networkChannel("NFL Net", index)?.id, "nfln");
  assert.equal(networkChannel("ESPN+", index), null);
  assert.equal(networkChannel("Peacock", index), null);
  assert.equal(networkChannel("Hallmark", index), null);
});

test("guide listings: both team names in a title; backups ranked last", () => {
  const epg = epgOf([
    program("snp.us", "MLB Baseball: Phillies at Mets", "2026-09-26T16:00:00Z", 3),
  ]);
  const index = buildSportsChannelIndex(CHANNELS, epg, NOW);
  const game: SportsGame = {
    id: "3",
    league: "MLB",
    state: "in",
    detail: "",
    away: side("Philadelphia Phillies", { location: "Philadelphia", nickname: "Phillies" }),
    home: side("New York Mets", { location: "New York", nickname: "Mets" }),
    startMs: Date.parse("2026-09-26T16:10:00Z"),
  };
  assert.deepEqual(
    channelsForGame(game, index, NOW).map((c) => [c.channel.id, c.via]),
    [
      ["snp", "guide"],
      ["snp-backup", "guide"],
    ],
  );
});

test("guide listings: the league's generic listing in the home city", () => {
  const epg = epgOf([
    program(
      "snp.us",
      "MLB Baseball",
      "2026-09-26T16:00:00Z",
      3,
      "From Citizens Bank Park in Philadelphia.",
    ),
  ]);
  const index = buildSportsChannelIndex(CHANNELS, epg, NOW);
  const game: SportsGame = {
    id: "4",
    league: "MLB",
    state: "in",
    detail: "",
    away: side("Atlanta Braves", { location: "Atlanta", nickname: "Braves" }),
    home: side("Philadelphia Phillies", { location: "Philadelphia", nickname: "Phillies" }),
    startMs: Date.parse("2026-09-26T16:05:00Z"),
  };
  assert.equal(channelsForGame(game, index, NOW)[0]?.channel.id, "snp");
});

test("quality: 4K, then 1080, then HD, then untagged, then SD; 60 fps and backups adjust", () => {
  const names = [
    "US: FOX SD",
    "US: FOX",
    "US: FOX HD",
    "US: FOX FHD",
    "US: FOX 4K",
    "US: FOX FHD 60FPS",
    "US: FOX 4K Backup",
  ];
  const order = [...names].sort((a, b) => channelQuality(b) - channelQuality(a));
  assert.deepEqual(order, [
    "US: FOX 4K",
    "US: FOX FHD 60FPS",
    "US: FOX FHD",
    "US: FOX 4K Backup",
    "US: FOX HD",
    "US: FOX",
    "US: FOX SD",
  ]);
  assert.equal(
    channelQuality("NFL 1080p60: Bears vs Packers") > channelQuality("NFL 1080p: Bears vs Packers"),
    true,
  );
  // Words that merely contain the tags don't count.
  assert.equal(channelQuality("US: HDTV Classics"), channelQuality("US: Classics"));
});

test("network versions: best picture first, spin-offs still left out", () => {
  const index = buildSportsChannelIndex(
    [
      ch("fox", "US: FOX", "USA", "fox.us"),
      ch("fox-hd", "US: FOX HD", "USA", "fox.us"),
      ch("fox-4k", "US: FOX 4K", "USA", "fox.us"),
      ch("fox-fhd60", "US: FOX FHD 60FPS", "USA", "fox.us"),
      ch("fox-news", "US: FOX NEWS", "USA", "foxnews.us"),
    ],
    null,
    NOW,
  );
  assert.deepEqual(
    networkChannels("FOX", index).map((c) => c.id),
    ["fox-4k", "fox-fhd60", "fox-hd", "fox"],
  );
  assert.equal(networkChannel("FOX", index)?.id, "fox-4k");
});

test("a game's event feeds lead with the best picture", () => {
  const index = buildSportsChannelIndex(
    [
      ch("sd", "NCAAF 03: #1 Texas vs. #14 Tennessee @ 26 Sep 12:00 PM ET", "USA NCAAF"),
      ch("fhd", "NCAAF 04 FHD: #1 Texas vs. #14 Tennessee @ 26 Sep 12:00 PM ET", "USA NCAAF"),
      ch("abc", "US: ABC HD", "USA Entertainment", "abc.us"),
    ],
    null,
    NOW,
  );
  const game: SportsGame = {
    id: "g",
    league: "NCAAF",
    state: "pre",
    detail: "",
    startMs: Date.parse("2026-09-26T16:00:00Z"),
    away: side("Tennessee Volunteers", { location: "Tennessee" }),
    home: side("Texas Longhorns", { location: "Texas" }),
    network: "ABC",
  } as SportsGame;
  assert.deepEqual(
    channelsForGame(game, index, NOW).map((c) => c.channel.id),
    ["fhd", "abc", "sd"],
  );
});

test("quality badges", () => {
  assert.equal(qualityLabel("US: FOX 4K"), "4K");
  assert.equal(qualityLabel("US: FOX UHD Backup"), "4K");
  assert.equal(qualityLabel("NFL 1080p60: Bears vs Packers"), "1080 60");
  assert.equal(qualityLabel("US: ESPN FHD"), "1080");
  assert.equal(qualityLabel("US: ESPN HD"), "HD");
  assert.equal(qualityLabel("US: ESPN"), null);
});

test("preferred broadcasters and best quality lead only among matching game broadcasts", () => {
  const index = buildSportsChannelIndex(
    [
      ch("other", "Other Sports 4K", "", "other"),
      ch("espn-hd", "US: ESPN HD"),
      ch("espn-fhd", "US: ESPN FHD 60FPS"),
      ch("abc", "US: ABC HD"),
      ch("fox", "US: FOX HD"),
      ch("nbc", "US: NBC HD"),
    ],
    null,
    NOW,
  );
  const game: SportsGame = {
    id: "preferred",
    league: "NFL",
    state: "pre",
    detail: "",
    startMs: NOW.getTime(),
    home: side("Bears"),
    away: side("Lions"),
    network: "ABC",
    broadcasts: ["ESPN", "FOX", "NBC"],
  };
  assert.deepEqual(
    channelsForGame(game, index, NOW).map((c) => c.channel.id),
    ["espn-fhd", "espn-hd", "abc", "fox", "nbc"],
  );
  assert.deepEqual(
    channelsForGame({ ...game, network: "NBC", broadcasts: [] }, index, NOW).map(
      (c) => c.channel.id,
    ),
    ["nbc"],
  );
});

test("a game's own US network leads, foreign feeds follow, and SD drops when better exists", () => {
  const ch = (id: string, name: string, group = "USA Sports"): IptvChannel => ({
    id,
    tvgId: null,
    name,
    logo: null,
    group,
    url: `https://x/${id}`,
    catchupSource: null,
    durationSec: null,
    attrs: {},
  });
  assert.equal(foreignFeed(ch("a", "UK: Sky Sports Main Event UHD", "UK Sports")), 1);
  assert.equal(foreignFeed(ch("b", "Sky Sports NBA", "UK| Sports")), 1);
  assert.equal(foreignFeed(ch("c", "USA ESPN UHD")), 0);
  assert.equal(foreignFeed(ch("d", "ESPN 4K")), 0);
  assert.equal(isSdChannel("USA ESPN SD"), true);
  assert.equal(isSdChannel("USA ESPN HD"), false);
});

test("an NBA TV game plays on NBA TV, not on another country's sports channel", () => {
  const start = "2026-09-26T16:00:00Z";
  const index = buildSportsChannelIndex(
    [
      ch("sky", "UK: Sky Sports NBA UHD", "UK Sports", "sky.uk"),
      ch("nbatv-sd", "USA NBA TV SD", "USA Sports", "nbatv.us"),
      ch("nbatv", "USA NBA TV HD", "USA Sports", "nbatv.us"),
    ],
    epgOf([program("sky.uk", "NBA: Knicks at Celtics", start, 3)]),
    NOW,
  );
  const game = {
    id: "n",
    league: "NBA",
    state: "in",
    detail: "",
    startMs: Date.parse(start),
    away: side("New York Knicks", { nickname: "Knicks", location: "New York" }),
    home: side("Boston Celtics", { nickname: "Celtics", location: "Boston" }),
    network: "NBA TV",
  } as SportsGame;
  assert.deepEqual(
    channelsForGame(game, index, NOW).map((c) => c.channel.id),
    ["nbatv", "sky"],
  );
});

test("a 4K/8K group lifts its untagged event slots above another provider's plain slot", () => {
  const pass = ch("pass", "LIVE | ATL - HAWKS VS MIA - HEAT | Wed 28 Oct", "US| NBA PASS PPV \u2078\u1d37");
  const plain = ch("plain", "USA NBA 10: Lakers vs Warriors", "USA NBA");
  assert.equal(channelQualityOf(pass), 40);
  assert.equal(channelQualityOf(plain), 10);
  assert.equal(channelQualityOf(ch("q", "US: FOX FHD 60FPS", "US| 8K Sports")), 45);
});
