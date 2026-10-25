import assert from "node:assert/strict";
import test from "node:test";
import {
  carriesAcrossDevices,
  decodeDeviceSnapshot,
  deviceClassFor,
  devicePatch,
  deviceValues,
  encodeDeviceSnapshot,
  isDeviceSetting,
  mergeDeviceValues,
  seedDeviceValues,
} from "../src/lib/jl/account/device-settings.ts";

test("device classes group desktops together and keep web and Android apart", () => {
  assert.equal(deviceClassFor("windows"), "desktop");
  assert.equal(deviceClassFor("macos"), "desktop");
  assert.equal(deviceClassFor("linux"), "desktop");
  assert.equal(deviceClassFor("web"), "web");
  assert.equal(deviceClassFor("android"), "android");
});

test("machine paths, keys and profile preferences stay out of the device snapshot", () => {
  assert.equal(isDeviceSetting("downloadDir"), false);
  assert.equal(isDeviceSetting("rdKey"), false);
  assert.equal(isDeviceSetting("iptvPlaylists"), false);
  assert.equal(isDeviceSetting("uiLanguage"), false);
  assert.equal(isDeviceSetting("_navHideMigrateV1"), false);
  assert.equal(isDeviceSetting("navCustomization"), true);
  const values = deviceValues(
    {
      sidebarCollapsed: true,
      homeMode: "classic",
      downloadDir: "C:\\Downloads",
      theme: { preset: "jl", backgroundImage: "data:image/png;base64,AAAA" },
    },
    { sidebarCollapsed: false, homeMode: "classic", theme: { preset: "default" } },
  );
  assert.deepEqual(Object.keys(values).sort(), ["sidebarCollapsed", "theme"]);
  assert.equal(values.theme.includes("backgroundImage"), false);
});

test("the theme keeps this device's background image when applied", () => {
  const patch = devicePatch(
    { theme: JSON.stringify({ preset: "jl" }), sidebarCollapsed: "" },
    { theme: { preset: "old", backgroundImage: "local.png" }, sidebarCollapsed: true },
    { sidebarCollapsed: false },
  );
  assert.deepEqual(patch.theme, { preset: "jl", backgroundImage: "local.png" });
  assert.equal(patch.sidebarCollapsed, false);
});

test("a fresh install has nothing to push and takes the account's settings", () => {
  const fresh = mergeDeviceValues({}, {}, { sidebarCollapsed: "true" });
  assert.deepEqual(fresh.apply, { sidebarCollapsed: "true" });
  assert.deepEqual(fresh.push, {});
  const both = mergeDeviceValues({}, { homeMode: '"rows"' }, { homeMode: '"hero"', a: "1" });
  assert.deepEqual(both.apply, { homeMode: '"hero"', a: "1" });
  const mine = mergeDeviceValues({}, { homeMode: '"rows"' }, {});
  assert.deepEqual(mine.push, { homeMode: '"rows"' });
  assert.deepEqual(mine.next, { homeMode: '"rows"' });
});

test("after the first sync, the side that changed wins, including a reset to default", () => {
  const first = mergeDeviceValues({}, { a: "1" }, { a: "1" });
  assert.deepEqual(mergeDeviceValues(first.base, { a: "2" }, { a: "1" }).push, { a: "2" });
  const remoteEdit = mergeDeviceValues(first.base, { a: "1" }, { a: "3" });
  assert.deepEqual(remoteEdit.apply, { a: "3" });
  assert.deepEqual(remoteEdit.push, {});
  const reset = mergeDeviceValues(first.base, {}, { a: "1" });
  assert.deepEqual(reset.push, { a: "" });
  assert.deepEqual(reset.next, {});
  const resetElsewhere = mergeDeviceValues(first.base, { a: "1" }, {});
  assert.deepEqual(resetElsewhere.apply, { a: "" });
});

test("a new kind of device starts from another kind's setup, minus player and input settings", () => {
  assert.equal(carriesAcrossDevices("mpvHwdec"), false);
  assert.equal(carriesAcrossDevices("playerEngine"), false);
  assert.equal(carriesAcrossDevices("tvNavigation"), false);
  assert.equal(carriesAcrossDevices("playerTitleScale"), true);
  assert.equal(carriesAcrossDevices("theme"), true);
  assert.equal(carriesAcrossDevices("sportsLeagues"), true);
  const seed = seedDeviceValues("web", {
    desktop: { theme: '{"preset":"jl"}', playerEngine: '"mpv"', sidebarCollapsed: "true" },
  });
  assert.deepEqual(seed, { theme: '{"preset":"jl"}' });
  assert.deepEqual(seedDeviceValues("android", {}), {});
});

test("snapshots round-trip and ignore damaged or foreign entries", () => {
  const raw = encodeDeviceSnapshot({ theme: "{}", downloadDir: '"x"' });
  assert.deepEqual(decodeDeviceSnapshot(raw), { theme: "{}" });
  assert.deepEqual(decodeDeviceSnapshot("not json"), {});
  assert.deepEqual(decodeDeviceSnapshot(undefined), {});
});
