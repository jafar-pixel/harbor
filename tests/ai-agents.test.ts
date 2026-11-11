import assert from "node:assert/strict";
import test from "node:test";
import type { IptvChannel } from "../src/lib/iptv/types.ts";
import type { Meta } from "../src/lib/cinemeta.ts";
import { cleanChannelName, genreByRules } from "../src/lib/agents/live/genre.ts";
import { liveLabel, resetLiveAgentStore, setLiveEdit } from "../src/lib/agents/live/store.ts";
import { liveNamesForClaude, sortLiveWithClaude } from "../src/lib/agents/live/ai-sort.ts";
import { liveGenreRows } from "../src/lib/agents/live/rows.ts";
import { picksFromAnswer } from "../src/lib/agents/picks-core.ts";

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

function claudeReply(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      id: "m",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: JSON.stringify(payload) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("Live TV agent rules read the providers' naming styles", () => {
  const g = (name: string, group = "") => genreByRules(name, group)?.genre ?? null;
  assert.equal(g("USA CNN HD"), "news");
  assert.equal(g("US: MSNBC FHD"), "news");
  assert.equal(g("USA Disney Junior"), "kids");
  assert.equal(g("USA Nickelodeon East"), "kids");
  assert.equal(g("USA HBO 2 UHD"), "movies");
  assert.equal(g("USA HGTV"), "lifestyle");
  assert.equal(g("USA Discovery Channel"), "documentary");
  assert.equal(g("USA Telemundo"), "spanish");
  assert.equal(g("USA ESPN UHD"), "sports");
  assert.equal(g("USA Network HD"), "entertainment");
  assert.equal(g("USA TBS"), "entertainment");
  assert.equal(g("IA | Des Moines | NBC WHO"), "local");
  // The name decides before the group; an unknown name falls back to the group.
  assert.equal(g("USA CNN", "USA Entertainment"), "news");
  assert.equal(g("Channel 4521", "USA Kids"), "kids");
  assert.equal(g("Channel 4521"), null);
  assert.equal(g("Stingray Pop Adult", "Live • Radio"), "music");
  assert.equal(g("USA Adult Swim"), "entertainment");
  assert.equal(g("TX | Lubbock | FOX Net", "Live • FOX"), "local");
  assert.equal(g("USA PBS LOS ANGELES", "Live • Local Channels"), "local");
  assert.equal(cleanChannelName("USA HGTV FHD"), "HGTV");
  assert.equal(cleanChannelName("USA Network HD"), "USA Network");
});

test("Live TV rows: by kind, hidden left out, pinned first, adult never", () => {
  resetLiveAgentStore();
  const channels = [
    ch("1", "USA CNN HD"),
    ch("2", "USA MSNBC"),
    ch("3", "USA Fox News"),
    ch("4", "USA Bloomberg"),
    ch("5", "USA Disney Junior"),
    ch("6", "USA XXX Adults 1"),
    ch("7", "USA XXX Adults 2"),
    ch("8", "USA XXX Adults 3"),
  ];
  setLiveEdit("USA MSNBC", "hide");
  setLiveEdit("USA Bloomberg", "pin");
  const rows = liveGenreRows(channels);
  assert.deepEqual(
    rows.map((r) => r.genre),
    ["news"],
  );
  assert.deepEqual(
    rows[0].channels.map((c) => c.id),
    ["4", "1", "3"],
  );
});

test("Live TV agent asks Claude once for names the rules can't place", async () => {
  resetLiveAgentStore();
  const channels = [ch("1", "USA CNN HD"), ch("2", "XYZ Prime 7", "Misc"), ch("3", "Zeta One")];
  assert.deepEqual(
    liveNamesForClaude(channels).map((p) => p.name),
    ["XYZ Prime 7", "Zeta One"],
  );
  const original = globalThis.fetch;
  let calls = 0;
  let sent = "";
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls += 1;
    sent = String(init?.body ?? "");
    return claudeReply({
      channels: [{ i: 0, genre: "movies", brand: "XYZ Prime" }],
    });
  }) as typeof fetch;
  try {
    const done = await sortLiveWithClaude({ key: "k", model: "claude-opus-5-5" }, channels);
    assert.equal(done, 2);
    assert.equal(calls, 1);
    assert.match(sent, /XYZ Prime 7 \| Misc/);
    assert.equal(liveLabel("XYZ Prime 7")?.genre, "movies");
    assert.equal(liveLabel("XYZ Prime 7")?.brand, "XYZ Prime");
    // Skipped by Claude: counted as asked, so it isn't sent again.
    assert.equal(liveLabel("Zeta One")?.genre, "other");
    assert.deepEqual(liveNamesForClaude(channels), []);
  } finally {
    globalThis.fetch = original;
  }
});

test("Movies & Shows agent keeps only real, unrepeated picks from the pool", () => {
  const pool = ["A", "B", "C"].map(
    (name, i): Meta => ({ id: `tt${i}`, type: "movie", name }) as Meta,
  );
  const picks = picksFromAnswer(
    JSON.stringify({
      picks: [
        { i: 2, why: "Same tension as A." },
        { i: 2, why: "dup" },
        { i: 9, why: "out of range" },
        { i: 0, why: "" },
      ],
    }),
    pool,
  );
  assert.deepEqual(
    picks.map((p) => [p.meta.name, p.why]),
    [
      ["C", "Same tension as A."],
      ["A", ""],
    ],
  );
  assert.deepEqual(picksFromAnswer("not json", pool), []);
});
