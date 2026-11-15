import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  isHlsPlaylist,
  openTicket,
  relay,
  relayKey,
  rewriteHls,
  sealTicket,
} from "../server/relay.ts";

const HEX = "a".repeat(64);

test("tickets open only with the key, and not after they expire", async () => {
  const key = (await relayKey(HEX))!;
  const other = (await relayKey("b".repeat(64)))!;
  const t = await sealTicket(key, "http://provider.example/live/1.m3u8", Date.now() + 60_000);
  assert.equal((await openTicket(key, t))?.url, "http://provider.example/live/1.m3u8");
  assert.equal(await openTicket(other, t), null, "another key can't open it");
  assert.equal(await openTicket(key, t.slice(0, -2) + "AA"), null, "a changed ticket is refused");
  const old = await sealTicket(key, "http://provider.example/x", Date.now() - 1);
  assert.equal(await openTicket(key, old), null, "an expired ticket is refused");
  assert.equal(relayKey("short"), null);
});

test("a channel list is left alone; a live HLS playlist is rewritten", async () => {
  assert.equal(isHlsPlaylist('#EXTM3U\n#EXTINF:-1 tvg-id="a",ESPN\nhttp://x/1.ts'), false);
  assert.equal(isHlsPlaylist("#EXTM3U\n#EXT-X-TARGETDURATION:6\nseg1.ts"), true);
  const out = await rewriteHls(
    '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:6,\nseg1.ts\n#EXTINF:6,\nhttp://cdn.example/seg2.ts\n',
    "http://provider.example/live/chan/index.m3u8",
    async (u) => `T(${u})`,
  );
  assert.match(
    out,
    /URI="\/secure\/T\(http:\/\/provider\.example\/live\/chan\/key\.bin\)\/key\.bin"/,
  );
  assert.match(out, /^\/secure\/T\(http:\/\/provider\.example\/live\/chan\/seg1\.ts\)\/seg1\.ts$/m);
  assert.match(out, /^\/secure\/T\(http:\/\/cdn\.example\/seg2\.ts\)\/seg2\.ts$/m);
  assert.match(out, /^#EXTINF:6,$/m);
});

test("the relay fetches through a ticket and keeps segments on the relay", async () => {
  const upstream = createServer((req, res) => {
    if (req.url === "/live.m3u8") {
      res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
      res.end("#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg1.ts\n");
    } else if (req.url === "/seg1.ts") {
      res.writeHead(200, { "Content-Type": "video/mp2t" });
      res.end("TSDATA");
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  const port = (upstream.address() as { port: number }).port;
  try {
    const key = (await relayKey(HEX))!;
    const t = await sealTicket(key, `http://127.0.0.1:${port}/live.m3u8`, Date.now() + 60_000);
    const res = (await relay(new Request(`http://me/secure/${t}/live.m3u8`), key))!;
    assert.equal(res.status, 200);
    const text = await res.text();
    const seg = text.split("\n").find((l) => l.startsWith("/secure/"))!;
    assert.ok(seg.endsWith("/seg1.ts"), text);
    const segRes = (await relay(new Request(`http://me${seg}`), key))!;
    assert.equal(await segRes.text(), "TSDATA");
    assert.equal(segRes.headers.get("content-type"), "video/mp2t");
    assert.equal((await relay(new Request("http://me/secure/bad/x.ts"), key))!.status, 403);
    assert.equal((await relay(new Request(`http://me/secure/${t}/x`), null))!.status, 404);
    assert.equal(await relay(new Request("http://me/other"), key), null);
  } finally {
    upstream.close();
  }
});
