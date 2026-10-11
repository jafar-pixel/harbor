import assert from "node:assert/strict";
import test from "node:test";
import { nativeFetchUrl } from "../src/lib/native-fetch.ts";

const g = globalThis as { window?: unknown };

test("native fetch: only inside the TV app, with the URL and user agent in the query", () => {
  g.window = {};
  assert.equal(nativeFetchUrl("http://example.com/x"), null);
  g.window = { JLNativeFetch: { isAvailable: () => false } };
  assert.equal(nativeFetchUrl("http://example.com/x"), null);
  g.window = {
    JLNativeFetch: {
      isAvailable: () => {
        throw new Error("gone");
      },
    },
  };
  assert.equal(nativeFetchUrl("http://example.com/x"), null);
  g.window = { JLNativeFetch: { isAvailable: () => true } };
  const out = new URL(nativeFetchUrl("http://example.com:8080/player_api.php?a=1&b=2", "UA/1")!);
  assert.equal(out.origin, "https://jl-native-fetch.invalid");
  assert.equal(out.searchParams.get("u"), "http://example.com:8080/player_api.php?a=1&b=2");
  assert.equal(out.searchParams.get("ua"), "UA/1");
  delete g.window;
});
