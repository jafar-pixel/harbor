import assert from "node:assert/strict";
import test from "node:test";
import type { IptvChannel } from "../src/lib/iptv/types.ts";
import type { SportsGame, SportsSide } from "../src/lib/sports/espn.ts";
import { areaFit, classifyByRules } from "../src/lib/sports/agent/classify.ts";
import {
  agentLabel,
  resetAgentStore,
  saveAgentLabels,
  setAgentArea,
  setAgentEdit,
  nameKey,
} from "../src/lib/sports/agent/store.ts";
import {
  labelFromAnswer,
  namesForClaude,
  sortWithClaude,
} from "../src/lib/sports/agent/ai-sort.ts";
import {
  buildSportsChannelIndex as buildHubIndex,
  channelsForGame,
} from "../src/lib/jl/sports/channels.ts";
import { buildSportsChannelIndex, matchChannelsForGame } from "../src/lib/sports/iptv-match.ts";

const ch = (id: string, name: string, group = ""): IptvChannel => ({
  id,
  tvgId: null,
  name,
  logo: null,
  group,
  url: `http://example.test/${id}`,
  catchupSource: null,
  durationSec: null,
  attrs: {},
});
const side = (name: string, extra: Partial<SportsSide> = {}): SportsSide => ({
  id: name,
  name,
  abbr: "",
  logo: "",
  score: "",
  winner: false,
  ...extra,
});
const NOW = new Date("2026-11-11T03:00:00Z");

test("the rules read the viewer's real channel names", () => {
  assert.deepEqual(classifyByRules("IA | Des Moines | NBC WHO"), {
    kind: "local",
    network: "NBC",
    state: "IA",
    city: "des moines",
    by: "rules",
  });
  assert.equal(classifyByRules("USA NBC 13 WVTM BIRMINGHAM (2)")?.city, "birmingham");
  assert.equal(classifyByRules("USA abc18 KWYB Butte")?.network, "ABC");
  assert.equal(classifyByRules("NFL CBS BEARS CHICAGO IL")?.kind, "team");
  assert.equal(classifyByRules("SP - ESPN 1 HD")?.network, "ESPN");
  assert.equal(classifyByRules("SP - ESPN 2 HD")?.network, "ESPN2");
  assert.equal(classifyByRules("SP - FOX SPORTS 1 USA HD")?.network, "FS1");
  assert.equal(classifyByRules("USA ESPN UHD")?.network, "ESPN");
  assert.equal(classifyByRules("NFL | 13 -MNF 8:15PM Ravens at Chargers")?.kind, "event");
  assert.equal(classifyByRules("NCAAF 21: 3:30PM Pittsburgh at Notre Dame")?.league, "NCAAF");
  assert.equal(classifyByRules("USA ESPN+ 018: NFL Live (2026-08-19 16:00:00)")?.network, "ESPN+");
  // Regional sports networks are left for Claude.
  assert.equal(classifyByRules("SP - BALLY SPORTS OHIO HD"), null);
});

test("area: city beats state, and another state never counts (Portland, OR vs Portland, ME)", () => {
  const area = { state: "OR", city: "Portland" };
  assert.equal(areaFit({ state: "OR", city: "portland" }, area), 2);
  assert.equal(areaFit({ state: "OR", city: "eugene" }, area), 1);
  assert.equal(areaFit({ state: "ME", city: "portland" }, area), 0);
  assert.equal(areaFit({ city: "portland" }, area), 2);
  assert.equal(areaFit({ state: "OR", city: "portland" }, { state: "", city: "" }), 0);
});

test("a game on NBC plays the viewer's own NBC station, not another region's", () => {
  resetAgentStore();
  setAgentArea("OR", "Portland");
  const channels = [
    ch("ny", "USA NBC 4 WNBC NEW YORK"),
    ch("pdx", "OR | Portland | NBC KGW"),
    ch("me", "ME | Portland | NBC WCSH"),
    ch("plain", "USA NBC HD"),
  ];
  const game: SportsGame = {
    id: "nbc-game",
    league: "NBA",
    state: "in",
    detail: "",
    away: side("Oklahoma City Thunder", { location: "Oklahoma City", nickname: "Thunder" }),
    home: side("Portland Trail Blazers", { location: "Portland", nickname: "Trail Blazers" }),
    startMs: NOW.getTime(),
    network: "NBC",
    broadcasts: ["NBC"],
  };
  const hub = channelsForGame(game, buildHubIndex(channels, null, NOW), NOW);
  assert.equal(hub[0]?.channel.id, "pdx");
  assert.ok(!hub.slice(0, 1).some((c) => c.channel.id === "me"));
  const page = matchChannelsForGame(game, buildSportsChannelIndex(channels), { maxHeight: 2160 });
  assert.equal(page[0]?.channel.id, "pdx");
  assert.equal(page[0]?.tier, "exact");
  // Another region's NBC is never a sure pick.
  assert.notEqual(page.find((m) => m.channel.id === "ny")?.tier, "exact");
});

test("the viewer's edits win: a hidden channel is never picked, a pinned one first", () => {
  resetAgentStore();
  const channels = [ch("a", "USA ESPN UHD"), ch("b", "SP - ESPN 1 HD"), ch("c", "USA ESPN HD")];
  const game: SportsGame = {
    id: "espn-game",
    league: "NBA",
    state: "in",
    detail: "",
    away: side("Kansas Jayhawks", { location: "Kansas" }),
    home: side("Kentucky Wildcats", { location: "Kentucky" }),
    startMs: NOW.getTime(),
    broadcasts: ["ESPN"],
  };
  setAgentEdit("USA ESPN UHD", "hide");
  setAgentEdit("USA ESPN HD", "pin");
  const page = matchChannelsForGame(game, buildSportsChannelIndex(channels), { maxHeight: 2160 });
  assert.ok(!page.some((m) => m.channel.id === "a"));
  assert.equal(page[0]?.channel.id, "c");
  const hub = channelsForGame(
    { ...game, network: "ESPN" },
    buildHubIndex(channels, null, NOW),
    NOW,
  );
  assert.ok(!hub.some((c) => c.channel.id === "a"));
  assert.equal(hub[0]?.channel.id, "c");
});

test("Claude's answer makes a regional network findable for its games", () => {
  resetAgentStore();
  const channels = [
    ch("ohio", "SP - BALLY SPORTS OHIO HD"),
    ch("other", "SP - BALLY SPORTS WEST HD"),
  ];
  saveAgentLabels({
    [nameKey("SP - BALLY SPORTS OHIO HD")]: {
      kind: "network",
      network: "FanDuel SN Ohio",
      by: "ai",
    },
    [nameKey("SP - BALLY SPORTS WEST HD")]: {
      kind: "network",
      network: "FanDuel SN West",
      by: "ai",
    },
  });
  const game: SportsGame = {
    id: "cle",
    league: "NBA",
    state: "in",
    detail: "",
    away: side("Boston Celtics", { location: "Boston" }),
    home: side("Cleveland Cavaliers", { location: "Cleveland" }),
    startMs: NOW.getTime(),
    network: "FanDuel SN Ohio",
    broadcasts: ["FanDuel SN Ohio"],
  };
  const page = matchChannelsForGame(game, buildSportsChannelIndex(channels), { maxHeight: 1080 });
  assert.equal(page[0]?.channel.id, "ohio");
  assert.equal(page[0]?.tier, "exact");
  const hub = channelsForGame(game, buildHubIndex(channels, null, NOW), NOW);
  assert.equal(hub[0]?.channel.id, "ohio");
  assert.ok(!hub.some((c) => c.channel.id === "other"));
});

test("Claude is only asked about unplaced sports names, once, and its answers are kept", async () => {
  resetAgentStore();
  const channels = [
    ch("1", "SP - BALLY SPORTS OHIO HD", "|NA| USA SPORTS"),
    ch("2", "USA ESPN UHD", "|NA| USA SPORTS"),
    ch("3", "USA St Louis Cardinals", "|NA| USA MLB"),
    ch("4", "USA Cooking Channel", "|NA| USA GENERAL"),
  ];
  assert.deepEqual(namesForClaude(channels), [
    "SP - BALLY SPORTS OHIO HD",
    "USA St Louis Cardinals",
  ]);
  assert.equal(labelFromAnswer({ kind: "local", state: "zz", city: "X" }).state, undefined);

  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    const text = JSON.stringify({
      channels: [
        {
          i: 0,
          kind: "network",
          network: "FanDuel SN Ohio",
          league: null,
          state: null,
          city: null,
        },
        {
          i: 1,
          kind: "network",
          network: "FanDuel SN Midwest",
          league: "MLB",
          state: null,
          city: null,
        },
      ],
    });
    return new Response(
      JSON.stringify({
        id: "m",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const sorted = await sortWithClaude({ key: "k", model: "claude-opus-5-5" }, channels);
    assert.equal(sorted, 2);
    assert.equal(calls, 1);
    assert.equal(agentLabel("SP - BALLY SPORTS OHIO HD")?.network, "FanDuel SN Ohio");
    assert.equal(agentLabel("SP - BALLY SPORTS OHIO HD")?.by, "ai");
    // Already answered: nothing left to ask.
    assert.deepEqual(namesForClaude(channels), []);
  } finally {
    globalThis.fetch = original;
  }
});
