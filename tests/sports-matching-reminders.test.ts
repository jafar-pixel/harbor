import assert from "node:assert/strict";
import test from "node:test";
import { eventChannelEvidence } from "../src/lib/sports/event-match.ts";
import { buildSportsChannelIndex, matchChannelsForGame } from "../src/lib/sports/iptv-match.ts";
import { dueReminderChannels, type SportsReminder } from "../src/lib/sports/reminder-state.ts";
import type { SportsGame } from "../src/lib/sports/espn-types.ts";
import type { IptvChannel } from "../src/lib/iptv/types.ts";
const fight: SportsGame = {
  id: "123",
  league: "UFC",
  state: "pre",
  detail: "",
  startMs: Date.parse("2026-09-20T01:00:00Z"),
  home: { id: "1", name: "Joshua Van", abbr: "VAN", logo: "", score: "", winner: false },
  away: { id: "2", name: "Alexandre Pantoja", abbr: "PAN", logo: "", score: "", winner: false },
  context: {
    id: "331",
    name: "UFC 331: Van vs. Pantoja 2",
    round: "",
    draw: "",
    venue: "",
    major: true,
  },
};
const channel = (id: string, name: string): IptvChannel => ({
  id,
  name,
  url: `https://example.com/${id}.m3u8`,
  logo: null,
  group: "Sports",
  tvgId: null,
  attrs: {},
  catchupSource: null,
  durationSec: null,
});
test("both fighters including short Van rank above generic UFC and stale named channels", () => {
  const index = buildSportsChannelIndex([
    channel("generic", "US: UFC HD"),
    channel("old", "UFC 02: NOCHE UFC SILVA VS DELGADO start:2026-09-12 22:55:00"),
    channel("exact", "PPV: VAN vs PANTOJA 2 HD start:2026-09-19 20:00:00"),
    channel("number", "UFC 331 Main Card"),
  ]);
  const matches = matchChannelsForGame(fight, index);
  assert.equal(matches[0].channel.id, "exact");
  assert.equal(matches[0].tier, "exact");
  assert.equal(matches.find((m) => m.channel.id === "generic")?.tier, "likely");
  assert.ok(!matches.some((m) => m.channel.id === "old"));
  assert.equal(matches.find((m) => m.channel.id === "number")?.tier, "exact");
});
test("wrong numbered events and replays are excluded; explicit attached choice is preserved", () => {
  const index = buildSportsChannelIndex([
    channel("old", "UFC 330 Van vs Pantoja"),
    channel("replay", "UFC 331 REPLAY"),
    channel("generic", "UFC HD"),
  ]);
  assert.deepEqual(
    matchChannelsForGame(fight, index).map((m) => m.channel.id),
    ["generic"],
  );
  assert.equal(matchChannelsForGame(fight, index, { attachedIds: ["old"] })[0].channel.id, "old");
});
test("a timed guide matchup promotes a generic network, but another day's program does not", () => {
  const base = buildSportsChannelIndex([channel("guide", "ESPN HD"), channel("generic", "UFC HD")]);
  const program = {
    channelTvgId: "guide",
    title: "UFC 331: Van vs Pantoja",
    description: null,
    category: null,
    iconUrl: null,
    startMs: fight.startMs - 3600_000,
    endMs: fight.startMs + 3600_000,
  };
  const index = { ...base, programs: new Map([["guide", [program]]]) };
  assert.equal(matchChannelsForGame(fight, index)[0].channel.id, "guide");
  assert.equal(matchChannelsForGame(fight, index)[0].tier, "exact");
  const stale = {
    ...base,
    programs: new Map([
      [
        "guide",
        [
          {
            ...program,
            startMs: program.startMs - 7 * 86400_000,
            endMs: program.endMs - 7 * 86400_000,
          },
        ],
      ],
    ]),
  };
  assert.notEqual(matchChannelsForGame(fight, stale)[0].tier, "exact");
});
test("name matching normalizes accents and does not treat shared United as both teams", () => {
  const game = {
    ...fight,
    context: undefined,
    league: "EPL",
    home: { ...fight.home, name: "Manchester United" },
    away: { ...fight.away, name: "Newcastle United" },
  };
  assert.equal(eventChannelEvidence(game, "United Sports").both, false);
  assert.equal(eventChannelEvidence(game, "Manchester United vs Newcastle United").both, true);
  assert.equal(
    eventChannelEvidence(
      { ...fight, away: { ...fight.away, name: "Alexandre Pântoja" } },
      "VAN VS PANTOJA",
    ).both,
    true,
  );
});
const now = Date.parse("2026-09-19T18:00:00Z");
const reminder: SportsReminder = {
  id: "event",
  name: "Test",
  league: "UFC",
  startMs: now + 15 * 60_000,
  leadMinutes: 15,
  channels: ["discord", "telegram"],
  sent: {},
  attempted: {},
  failed: [],
};
test("reminders are due at the selected lead time, never before or after the expiry window", () => {
  assert.deepEqual(dueReminderChannels(reminder, now - 1), []);
  assert.deepEqual(dueReminderChannels(reminder, now), ["discord", "telegram"]);
  assert.deepEqual(dueReminderChannels(reminder, reminder.startMs + 10 * 60_000 + 1), []);
});
test("successful notification destination is not retried when its peer failed", () => {
  assert.deepEqual(
    dueReminderChannels(
      { ...reminder, sent: { discord: now }, attempted: { telegram: now }, failed: ["telegram"] },
      now + 59_000,
    ),
    [],
  );
  assert.deepEqual(
    dueReminderChannels(
      { ...reminder, sent: { discord: now }, attempted: { telegram: now }, failed: ["telegram"] },
      now + 60_000,
    ),
    ["telegram"],
  );
});

test("a slate feed matches by its bracketed game and short team names", () => {
  const game: SportsGame = {
    ...fight,
    league: "NCAAM",
    startMs: Date.parse("2026-11-10T21:00:00Z"),
    home: { ...fight.home, name: "Duke Blue Devils", abbr: "DUKE", location: "Duke" },
    away: {
      ...fight.away,
      name: "Michigan State Spartans",
      abbr: "MSU",
      location: "Michigan State",
    },
    context: undefined,
  };
  const carries = eventChannelEvidence(
    game,
    "US (ESPN+ 135) | NCAA Men's Basketball: #5 MSU vs. #2 DUKE • WYO vs. UNC (#5 MSU vs. #2 DUKE) (2026-11-10 19:05:40)",
  );
  assert.equal(carries.both, true);
  assert.equal(carries.conflict, false);
  // Lists Duke's game but carries Florida at Florida State.
  const other = eventChannelEvidence(
    game,
    "US (ESPN+ 133) | NCAA Men's Basketball: #1 FLA vs. FSU • #5 MSU vs. #2 DUKE (#1 FLA vs. FSU) (2026-11-10 19:05:30)",
  );
  assert.equal(other.both, false);
  assert.equal(other.conflict, true);
  // Both teams must be in the same listing, not across two games.
  assert.equal(eventChannelEvidence(game, "Slate: DUKE vs. UNC • MSU vs. FSU").both, false);
  assert.equal(eventChannelEvidence(game, "ESPN+ 7: Michigan State at Duke").both, true);
  assert.equal(eventChannelEvidence(game, "Duke Energy Weather").both, false);
});

test("the Duke game picks the feed that carries it, ahead of the slate feeds", () => {
  const game: SportsGame = {
    ...fight,
    league: "mens-college-basketball",
    startMs: Date.parse("2026-11-10T21:00:00Z"),
    home: { ...fight.home, name: "Duke Blue Devils", abbr: "DUKE", location: "Duke" },
    away: {
      ...fight.away,
      name: "Michigan State Spartans",
      abbr: "MSU",
      location: "Michigan State",
    },
    context: undefined,
  };
  const names = [
    "US (ESPN+ 133) | NCAA Men's Basketball: #1 FLA vs. FSU • #5 MSU vs. #2 DUKE (#1 FLA vs. FSU) (2026-11-10 19:05:30)",
    "US (ESPN+ 134) | NCAA Men's Basketball: #1 FLA vs. FSU • #5 MSU vs. #2 DUKE • WYO vs. UNC (#1 FLA vs. FSU) (2026-11-10 19:05:35)",
    "US (ESPN+ 135) | NCAA Men's Basketball: #5 MSU vs. #2 DUKE • WYO vs. UNC (#5 MSU vs. #2 DUKE) (2026-11-10 19:05:40)",
    "USA ESPN+ 133: NCAA Men's Basketball: #1 FLA vs. FSU • #5 MSU vs. #2 DUKE (#1 FLA vs. FSU) (2026-11-10 19:05:30)",
  ];
  const channels: IptvChannel[] = names.map((name, i) => ({
    id: `c${i}`,
    tvgId: null,
    name,
    logo: null,
    group: "ESPN+",
    url: `http://example.test/${i}`,
    catchupSource: null,
    durationSec: null,
    attrs: {},
  }));
  const matches = matchChannelsForGame(game, buildSportsChannelIndex(channels));
  assert.equal(matches[0]?.channel.id, "c2");
  assert.equal(matches[0]?.tier, "exact");
  assert.ok(!matches.some((m) => m.channel.id === "c0" || m.channel.id === "c3"));
});

test("the game's own network comes first, in the quality the screen can show", () => {
  const game: SportsGame = {
    ...fight,
    league: "mens-college-basketball",
    startMs: Date.parse("2026-11-10T21:00:00Z"),
    home: { ...fight.home, name: "Duke Blue Devils", abbr: "DUKE", location: "Duke" },
    away: {
      ...fight.away,
      name: "Michigan State Spartans",
      abbr: "MSU",
      location: "Michigan State",
    },
    broadcasts: ["ESPN"],
    context: undefined,
  };
  const names = [
    "US (ESPN+ 135) | NCAA Men's Basketball: #5 MSU vs. #2 DUKE • WYO vs. UNC (#5 MSU vs. #2 DUKE) (2026-11-10 19:05:40)",
    "US: ESPN+",
    "US: ESPN SD",
    "US: ESPN FHD",
    "US: ESPN UHD",
    "US: ESPN 2 FHD",
  ];
  const channels: IptvChannel[] = names.map((name, i) => ({
    id: `c${i}`,
    tvgId: null,
    name,
    logo: null,
    group: "USA Sports",
    url: `http://example.test/${i}`,
    catchupSource: null,
    durationSec: null,
    attrs: {},
  }));
  const index = buildSportsChannelIndex(channels);
  const on4k = matchChannelsForGame(game, index, { maxHeight: 2160 });
  assert.deepEqual(
    on4k.slice(0, 3).map((m) => m.channel.name),
    ["US: ESPN UHD", "US: ESPN FHD", "US: ESPN SD"],
  );
  assert.equal(on4k[0].tier, "exact");
  const onHd = matchChannelsForGame(game, index, { maxHeight: 1080 });
  assert.equal(onHd[0].channel.name, "US: ESPN FHD");
  assert.equal(onHd[1].channel.name, "US: ESPN UHD");
  // ESPN+ and ESPN 2 are not the ESPN channel.
  for (const m of on4k)
    if (/ESPN\+|ESPN 2/.test(m.channel.name))
      assert.ok(!m.reasons.some((r) => r.kind === "broadcast"), m.channel.name);
});

test("a channel that failed here is never auto-picked and goes last", () => {
  const game: SportsGame = {
    ...fight,
    league: "mens-college-basketball",
    startMs: Date.parse("2026-11-10T21:00:00Z"),
    home: { ...fight.home, name: "Duke Blue Devils", abbr: "DUKE", location: "Duke" },
    away: {
      ...fight.away,
      name: "Michigan State Spartans",
      abbr: "MSU",
      location: "Michigan State",
    },
    broadcasts: ["ESPN"],
    context: undefined,
  };
  const channels: IptvChannel[] = ["US: ESPN UHD", "US: ESPN FHD"].map((name, i) => ({
    id: `c${i}`,
    tvgId: null,
    name,
    logo: null,
    group: "USA Sports",
    url: `http://example.test/${i}`,
    catchupSource: null,
    durationSec: null,
    attrs: {},
  }));
  const matches = matchChannelsForGame(game, buildSportsChannelIndex(channels), {
    maxHeight: 2160,
    health: (url) => (url.endsWith("/0") ? "failing" : "unknown"),
  });
  assert.equal(matches[0].channel.name, "US: ESPN FHD");
  assert.equal(matches[0].tier, "exact");
  assert.equal(matches.at(-1)!.failing, true);
  assert.notEqual(matches.at(-1)!.tier, "exact");
});

test("the viewer's own provider names: USA ESPN in four qualities beats ESPN+ and ESPN 2", () => {
  const game: SportsGame = {
    ...fight,
    league: "mens-college-basketball",
    startMs: Date.parse("2026-11-10T21:00:00Z"),
    home: { ...fight.home, name: "Duke Blue Devils", abbr: "DUKE", location: "Duke" },
    away: {
      ...fight.away,
      name: "Michigan State Spartans",
      abbr: "MSU",
      location: "Michigan State",
    },
    broadcasts: ["ESPN"],
    context: undefined,
  };
  // Real names from the viewer's playlist (links removed).
  const names = [
    "USA ESPN+ 018: Football: NFL Live (2026-08-19 16:00:00)",
    "USA ESPN NEWS HD",
    "USA ESPN SD",
    "USA ESPN HD",
    "USA ESPN 2",
    "USA ESPN U HD",
    "USA ESPN UHD",
    "USA ESPN HD (backup)",
    "USA ESPN Deportes",
  ];
  const channels: IptvChannel[] = names.map((name, i) => ({
    id: `c${i}`,
    tvgId: null,
    name,
    logo: null,
    group: "Sports • General",
    url: `http://example.test/${i}`,
    catchupSource: null,
    durationSec: null,
    attrs: {},
  }));
  const index = buildSportsChannelIndex(channels);
  const broadcast = (m: { reasons: { kind: string }[] }) =>
    m.reasons.some((r) => r.kind === "broadcast");
  const on4k = matchChannelsForGame(game, index, { maxHeight: 2160 });
  assert.equal(on4k[0].channel.name, "USA ESPN UHD");
  assert.equal(on4k[0].tier, "exact");
  assert.deepEqual(
    on4k.filter(broadcast).map((m) => m.channel.name),
    ["USA ESPN UHD", "USA ESPN HD", "USA ESPN HD (backup)", "USA ESPN SD"],
  );
  const onHd = matchChannelsForGame(game, index, { maxHeight: 1080 });
  assert.equal(onHd[0].channel.name, "USA ESPN HD");
});

test("the second provider's names: SP - ESPN 1 HD is ESPN, short schedule names match", () => {
  const base: SportsGame = {
    ...fight,
    league: "nfl",
    startMs: Date.parse("2026-11-10T21:00:00Z"),
    home: { ...fight.home, name: "Los Angeles Chargers", abbr: "LAC", location: "Los Angeles" },
    away: { ...fight.away, name: "Baltimore Ravens", abbr: "BAL", location: "Baltimore" },
    context: undefined,
  };
  // Real names from the viewer's second provider (links removed).
  const names = [
    "SP - ESPN 1 HD",
    "SP - ESPN 2 HD",
    "SP - ESPN U HD",
    "SP - ESPN (ACCN) HD",
    "SP - FOX SPORTS 1 USA HD",
    "SP - CBS SPORTS HD",
    "SP - BIG TEN NETWORK HD",
    "SP - NBA TV HD",
    "NFL - NFL NETWORK HD",
    "NFL - NFL REDZONE LQ",
  ];
  const channels: IptvChannel[] = names.map((name, i) => ({
    id: `c${i}`,
    tvgId: null,
    name,
    logo: null,
    group: "|NA| USA SPORTS",
    url: `http://example.test/${i}`,
    catchupSource: null,
    durationSec: null,
    attrs: {},
  }));
  const index = buildSportsChannelIndex(channels);
  const networkOf = (broadcasts: string[]) =>
    matchChannelsForGame({ ...base, broadcasts }, index, { maxHeight: 2160 })
      .filter((m) => m.reasons.some((r) => r.kind === "broadcast"))
      .map((m) => m.channel.name);
  assert.deepEqual(networkOf(["ESPN"]), ["SP - ESPN 1 HD"]);
  assert.deepEqual(networkOf(["ESPN2"]), ["SP - ESPN 2 HD"]);
  assert.deepEqual(networkOf(["ESPNU"]), ["SP - ESPN U HD"]);
  assert.deepEqual(networkOf(["ACCN"]), ["SP - ESPN (ACCN) HD"]);
  assert.deepEqual(networkOf(["FS1"]), ["SP - FOX SPORTS 1 USA HD"]);
  assert.deepEqual(networkOf(["CBSSN"]), ["SP - CBS SPORTS HD"]);
  assert.deepEqual(networkOf(["BTN"]), ["SP - BIG TEN NETWORK HD"]);
  assert.deepEqual(networkOf(["NBA TV"]), ["SP - NBA TV HD"]);
  assert.deepEqual(networkOf(["NFL Network"]), ["NFL - NFL NETWORK HD"]);
  // An event slot naming the game is an exact pick too.
  const slot: IptvChannel = {
    ...channels[0],
    id: "slot",
    name: "NFL | 13 -MNF 8:15PM Ravens at Chargers",
  };
  const withSlot = matchChannelsForGame(
    { ...base, broadcasts: ["ESPN"] },
    buildSportsChannelIndex([slot, ...channels]),
    { maxHeight: 2160 },
  );
  assert.equal(withSlot.find((m) => m.channel.id === "slot")?.tier, "exact");
});
