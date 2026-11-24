import assert from "node:assert/strict";
import test from "node:test";
import {
  nativeFetch,
  nativeFetchAvailable,
  nativeFetchCanSend,
  nativeProviderFetch,
} from "../src/lib/native-fetch.ts";

type Done = (id: string, error: string | null) => void;
const g = globalThis as {
  window?: { JLNativeFetch?: unknown; __jlNativeFetchDone?: Done };
  fetch: typeof fetch;
};
const realFetch = g.fetch;

/** A stand-in for the TV app's bridge: records requests and cancels, answers when told to. */
function fakeTv() {
  const started: Array<{ id: string; req: Record<string, unknown> }> = [];
  const cancelled: string[] = [];
  let next = 0;
  g.window = {
    JLNativeFetch: {
      isAvailable: () => true,
      start: (json: string) => {
        const id = String(++next);
        started.push({ id, req: JSON.parse(json) });
        return id;
      },
      cancel: (id: string) => cancelled.push(id),
    },
  };
  const answered: string[] = [];
  g.fetch = (async (input: string) => {
    answered.push(String(input));
    return new Response("hello", {
      status: 200,
      headers: { "content-type": "text/plain", "x-harbor-final-url": "https://addon.example/x" },
    });
  }) as typeof fetch;
  const done = (id: string, error: string | null = null) =>
    g.window!.__jlNativeFetchDone!(id, error);
  return { started, cancelled, answered, done };
}

function reset() {
  delete g.window;
  g.fetch = realFetch;
}

test("native fetch: only inside the TV app, and only with the request bridge", () => {
  g.window = {};
  assert.equal(nativeFetchAvailable(), false);
  g.window = { JLNativeFetch: { isAvailable: () => true } };
  assert.equal(nativeFetchAvailable(), false, "an older bridge without start()");
  g.window = { JLNativeFetch: { isAvailable: () => false, start: () => "1" } };
  assert.equal(nativeFetchAvailable(), false);
  g.window = {
    JLNativeFetch: {
      isAvailable: () => {
        throw new Error("gone");
      },
      start: () => "1",
    },
  };
  assert.equal(nativeFetchAvailable(), false);
  g.window = { JLNativeFetch: { isAvailable: () => true, start: () => "1" } };
  assert.equal(nativeFetchAvailable(), true);
  reset();
});

test("native fetch: which requests it can send", () => {
  assert.equal(nativeFetchCanSend("https://a.example/x"), true);
  assert.equal(nativeFetchCanSend("http://a.example/x", { method: "POST", body: "a=1" }), true);
  assert.equal(nativeFetchCanSend("/api/health"), false);
  assert.equal(nativeFetchCanSend("https://a.example/x", { redirect: "manual" }), false);
  assert.equal(nativeFetchCanSend("https://a.example/x", { body: new FormData() }), false);
});

test("native fetch: the TV makes the request, the page reads the answer", async () => {
  const tv = fakeTv();
  const pending = nativeFetch("https://api.real-debrid.com/rest/1.0/user", {
    method: "post",
    headers: { Authorization: "Bearer k" },
    body: "a=1",
  });
  await Promise.resolve();
  assert.equal(tv.started.length, 1);
  const { id, req } = tv.started[0];
  assert.equal(req.url, "https://api.real-debrid.com/rest/1.0/user");
  assert.equal(req.method, "POST");
  assert.equal(req.body, "a=1");
  assert.deepEqual(req.headers, {
    authorization: "Bearer k",
    "content-type": "text/plain;charset=UTF-8",
  });
  tv.done(id);
  const res = await pending;
  assert.equal(await res.text(), "hello");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-harbor-final-url"), "https://addon.example/x");
  assert.deepEqual(tv.answered, [`https://jl-native-fetch.invalid/r/${id}`]);
  assert.deepEqual(tv.cancelled, []);
  reset();
});

test("native fetch: a failed request rejects like fetch, without reading an answer", async () => {
  const tv = fakeTv();
  const pending = nativeFetch("https://addon.example/stream/movie/tt1.json");
  await Promise.resolve();
  tv.done(tv.started[0].id, "SocketTimeoutException: timeout");
  await assert.rejects(pending, (e: Error) => e instanceof TypeError && /timeout/.test(e.message));
  assert.deepEqual(tv.answered, []);
  reset();
});

test("native fetch: when the page gives up, the TV drops the request", async () => {
  const tv = fakeTv();
  const controller = new AbortController();
  const pending = nativeFetch("https://addon.example/catalog/search=ab.json", {
    signal: controller.signal,
  });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, (e: Error) => e.name === "AbortError");
  assert.deepEqual(tv.cancelled, [tv.started[0].id]);
  // A late "ready" for the dropped request changes nothing.
  tv.done(tv.started[0].id);
  assert.deepEqual(tv.answered, []);
  reset();
});

test("native fetch: IPTV providers get the player's user agent and a long wait", async () => {
  const tv = fakeTv();
  const pending = nativeProviderFetch("http://iptv.example:8080/get.php?u=a", "VLC/3.0.20")!;
  await Promise.resolve();
  const { id, req } = tv.started[0];
  assert.equal(req.url, "http://iptv.example:8080/get.php?u=a");
  assert.equal((req.headers as Record<string, string>)["user-agent"], "VLC/3.0.20");
  assert.equal(req.timeoutMs, 60_000);
  tv.done(id);
  assert.equal(await (await pending).text(), "hello");
  reset();
});
