import assert from "node:assert/strict";
import test from "node:test";
import { dedupePlaylists, playlistKey } from "../src/lib/iptv/playlist-dedupe.ts";

const x = (id: string, server: string, username = "u", epgUrl?: string) => ({
  id,
  name: server,
  url: "",
  kind: "xtream" as const,
  xtream: { server, username, password: "p" },
  ...(epgUrl ? { epgUrl } : {}),
});
const m = (id: string, url: string, epgUrl?: string) => ({
  id,
  name: url,
  url,
  kind: "m3u" as const,
  ...(epgUrl ? { epgUrl } : {}),
});

test("copies of the same provider collapse to the first, in order", () => {
  const { lists, replaced } = dedupePlaylists([
    x("a", "http://limited-name.com"),
    x("b", "http://xtreme.ink"),
    x("c", "http://LIMITED-name.com/"),
    x("d", "http://xtreme.ink"),
    m("e", "https://watch.jl-stream.com/smart/t/playlist.m3u"),
    m("f", "https://watch.jl-stream.com/smart/t/playlist.m3u"),
  ]);
  assert.deepEqual(
    lists.map((p) => p.id),
    ["a", "b", "e"],
  );
  assert.deepEqual(
    [...replaced],
    [
      ["c", "a"],
      ["d", "b"],
      ["f", "e"],
    ],
  );
});

test("different logins on one server stay separate", () => {
  const { lists } = dedupePlaylists([x("a", "http://s", "one"), x("b", "http://s", "two")]);
  assert.equal(lists.length, 2);
});

test("a later copy lends its guide link to the kept one", () => {
  const { lists } = dedupePlaylists([
    m("a", "http://p/list"),
    m("b", "http://p/list", "http://p/epg"),
  ]);
  assert.equal(lists.length, 1);
  assert.equal(lists[0].id, "a");
  assert.equal(lists[0].epgUrl, "http://p/epg");
});

test("nothing to remove leaves the same array", () => {
  const input = [m("a", "http://p/1"), m("b", "http://p/2")];
  const { lists, replaced } = dedupePlaylists(input);
  assert.equal(lists, input);
  assert.equal(replaced.size, 0);
});

test("entries without an address are never merged", () => {
  assert.equal(playlistKey(m("a", "")), null);
  const { lists } = dedupePlaylists([m("a", ""), m("b", "")]);
  assert.equal(lists.length, 2);
});
