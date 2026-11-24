import assert from "node:assert/strict";
import test from "node:test";
import { credsFromServer } from "../src/lib/iptv/xtream.ts";
import { hydrateShortEpg } from "../src/lib/iptv/xtream-short-epg.ts";
import type { IptvChannel } from "../src/lib/iptv/types.ts";

test("guide fill-in: leaving the screen stops the per-channel lookups", async () => {
  const realFetch = globalThis.fetch;
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 2) controller.abort();
    return new Response(JSON.stringify({ epg_listings: [] }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const creds = credsFromServer("http://iptv.example:8080", "u", "p")!;
    const channels = Array.from(
      { length: 20 },
      (_, i) => ({ id: `src::xt::${i + 1}`, tvgId: null }) as unknown as IptvChannel,
    );
    const out = await hydrateShortEpg(creds, channels, null, controller.signal);
    assert.equal(out, null);
    assert.equal(calls, 2, "no lookups after the screen went away");
  } finally {
    globalThis.fetch = realFetch;
  }
});
