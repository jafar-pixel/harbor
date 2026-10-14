import assert from "node:assert/strict";
import test from "node:test";
import { phoneCannotShow, resolvePlayTarget } from "../src/lib/remote/play-target.ts";

test("a phone on its own always plays the title itself", () => {
  for (const connected of [false, true]) {
    for (const preferPhone of [false, true]) {
      assert.equal(resolvePlayTarget({ remoteMode: false, connected, preferPhone }), "phone");
    }
  }
});

test("on the remote route a connected computer is the target until the phone is picked", () => {
  assert.equal(
    resolvePlayTarget({ remoteMode: true, connected: true, preferPhone: false }),
    "host",
  );
  assert.equal(
    resolvePlayTarget({ remoteMode: true, connected: true, preferPhone: true }),
    "phone",
  );
});

test("on the remote route with no computer connected the phone plays itself", () => {
  assert.equal(
    resolvePlayTarget({ remoteMode: true, connected: false, preferPhone: false }),
    "phone",
  );
});

test("leaving the picker or player for a page the phone cannot draw is caught", () => {
  assert.equal(phoneCannotShow("picker", "settings"), true);
  assert.equal(phoneCannotShow("player", "live"), true);
  assert.equal(phoneCannotShow("picker", "addons"), true);
});

test("moving between playback frames or back to the detail page is allowed", () => {
  assert.equal(phoneCannotShow("picker", "player"), false);
  assert.equal(phoneCannotShow("player", "picker"), false);
  assert.equal(phoneCannotShow("picker", "meta"), false);
  assert.equal(phoneCannotShow("picker", "home"), false);
  assert.equal(phoneCannotShow("home", "settings"), false);
});
