import assert from "node:assert/strict";
import test from "node:test";
import { replayChannels } from "../src/lib/jl/sports/replays.ts";
import type { IptvChannel } from "../src/lib/iptv/types.ts";

const ch = (id: string, name: string, group: string): IptvChannel => ({
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

test("replay groups and replay-named channels, by league", () => {
  const out = replayChannels([
    ch("a", "Bears vs Packers", "US | NFL Replay"),
    ch("b", "NBA Full Games 1 HD", "USA NBA"),
    ch("c", "USA ESPN HD", "USA Sports"),
    ch("d", "NHL Condensed", "USA NHL"),
  ]);
  assert.deepEqual(
    out.map((r) => [r.channel.id, r.league]),
    [
      ["b", "NBA"],
      ["a", "NFL"],
      ["d", "NHL"],
    ],
  );
});
