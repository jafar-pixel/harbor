import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  isHlsPlaylist,
  isPrivateAddress,
  reachable,
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
    const local = { allowPrivate: true };
    const res = (await relay(new Request(`http://me/secure/${t}/live.m3u8`), key, local))!;
    assert.equal(res.status, 200);
    const text = await res.text();
    const seg = text.split("\n").find((l) => l.startsWith("/secure/"))!;
    assert.ok(seg.endsWith("/seg1.ts"), text);
    const segRes = (await relay(new Request(`http://me${seg}`), key, local))!;
    assert.equal(await segRes.text(), "TSDATA");
    assert.equal(segRes.headers.get("content-type"), "video/mp2t");
    assert.equal((await relay(new Request("http://me/secure/bad/x.ts"), key))!.status, 403);
    assert.equal((await relay(new Request(`http://me/secure/${t}/x`), null))!.status, 404);
    assert.equal(await relay(new Request("http://me/other"), key), null);
  } finally {
    upstream.close();
  }
});

test("the relay never reaches into the home network unless the owner allows it", async () => {
  for (const a of [
    "127.0.0.1",
    "10.0.0.113",
    "192.168.1.1",
    "172.20.0.5",
    "169.254.1.1",
    "100.64.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:192.168.0.1",
  ])
    assert.equal(isPrivateAddress(a), true, a);
  for (const a of ["8.8.8.8", "104.16.1.1", "2606:4700::1111"])
    assert.equal(isPrivateAddress(a), false, a);
  assert.equal(
    await reachable(new URL("http://127.0.0.1:3101/"), {}),
    false,
    "never PROVEN or this machine",
  );
  assert.equal(await reachable(new URL("http://localhost:3102/"), {}), false);
  assert.equal(await reachable(new URL("http://router.local/"), {}), false);
  assert.equal(await reachable(new URL("file:///etc/passwd"), {}), false);
  assert.equal(await reachable(new URL("http://8.8.8.8/x"), {}), true);
  const allowHosts = new Set(["10.0.0.50:8080"]);
  assert.equal(await reachable(new URL("http://10.0.0.50:8080/list.m3u"), { allowHosts }), true);
  assert.equal(await reachable(new URL("http://10.0.0.50:9000/"), { allowHosts }), false);

  const key = (await relayKey(HEX))!;
  const t = await sealTicket(key, "http://127.0.0.1:3101/", Date.now() + 60_000, "someone");
  assert.equal((await relay(new Request(`http://me/secure/${t}/x`), key))!.status, 403);
});

test("a redirect into the home network is refused too", async () => {
  const upstream = createServer((_req, res) => {
    res.writeHead(302, { Location: "http://192.168.1.1/admin" }).end();
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  const port = (upstream.address() as { port: number }).port;
  try {
    const key = (await relayKey(HEX))!;
    const t = await sealTicket(key, `http://127.0.0.1:${port}/go`, Date.now() + 60_000, "a");
    const allowHosts = new Set([`127.0.0.1:${port}`]);
    const res = (await relay(new Request(`http://me/secure/${t}/go`), key, { allowHosts }))!;
    assert.equal(res.status, 403);
  } finally {
    upstream.close();
  }
});

test("one account can't hold more than its share of streams", async () => {
  const waiting = new Map<string, () => void>();
  const upstream = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "video/mp2t" });
    res.write("start");
    waiting.set(req.url ?? "", () => res.end("end"));
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  const port = (upstream.address() as { port: number }).port;
  const finish = async (path: string) => {
    for (let i = 0; i < 50 && !waiting.has(path); i++) await new Promise((r) => setTimeout(r, 10));
    waiting.get(path)?.();
    waiting.delete(path);
  };
  try {
    const key = (await relayKey(HEX))!;
    const opts = { allowPrivate: true, maxPerAccount: 1 };
    const exp = Date.now() + 60_000;
    const mine = await sealTicket(key, `http://127.0.0.1:${port}/a.ts`, exp, "me");
    const theirs = await sealTicket(key, `http://127.0.0.1:${port}/b.ts`, exp, "them");
    const first = (await relay(new Request(`http://me/secure/${mine}/a.ts`), key, opts))!;
    assert.equal(first.status, 200);
    const blocked = (await relay(new Request(`http://me/secure/${mine}/a.ts`), key, opts))!;
    assert.equal(blocked.status, 429);
    const other = (await relay(new Request(`http://me/secure/${theirs}/b.ts`), key, opts))!;
    assert.equal(other.status, 200, "another account isn't held up");
    await finish("/a.ts");
    assert.equal(await first.text(), "startend");
    await finish("/b.ts");
    await other.text();
    const again = (await relay(new Request(`http://me/secure/${mine}/a.ts`), key, opts))!;
    assert.equal(again.status, 200, "the share comes back when the stream ends");
    await finish("/a.ts");
    await again.text();
  } finally {
    upstream.closeAllConnections();
    upstream.close();
  }
});
