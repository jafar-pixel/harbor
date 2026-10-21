import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeAddonBackup,
  encodeAddonBackup,
  restoreAddonBackup,
  saveAddonBackup,
  type AddonBackupPorts,
  type PortableAddon,
} from "../src/lib/jl/account/addon-backup.ts";

const addon = (config = "one"): PortableAddon => ({
  id: "example.mediafusion",
  transportUrl: `https://addon.example/${config}/manifest.json?option=Example`,
  installedAt: 100,
});
function fixture() {
  let local: PortableAddon[] = [];
  let remote: string | null = null;
  let current = true;
  let writes = 0;
  const ports: AddonBackupPorts = {
    profileId: "example-profile",
    assertCurrent: () => {
      if (!current) throw new Error("Account or profile changed");
    },
    readLocal: () => local,
    writeLocal: (items) => {
      local = items;
      writes++;
    },
    pull: async () => remote,
    push: async (value) => {
      remote = value;
    },
  };
  return {
    ports,
    setLocal: (items: PortableAddon[]) => {
      local = items;
    },
    setRemote: (value: string | null) => {
      remote = value;
    },
    changeOwner: () => {
      current = false;
    },
    local: () => local,
    remote: () => remote,
    writes: () => writes,
  };
}

test("configured links retain case/query and distinct configurations of one addon", () => {
  const data = [addon("CaseSensitive"), addon("Other")];
  assert.deepEqual(
    decodeAddonBackup(encodeAddonBackup("example-profile", data), "example-profile"),
    data,
  );
});
test("backup serializes only installation fields, not cached manifests or extra values", () => {
  const text = encodeAddonBackup("example-profile", [
    { ...addon(), manifest: { logo: "file:///example" }, headers: { example: "value" } },
  ]);
  assert.equal(text.includes('manifest"'), false);
  assert.equal(text.includes("file:"), false);
  assert.equal(text.includes("headers"), false);
});
test("save on one device restores into another without external media accounts", async () => {
  const a = fixture();
  a.setLocal([addon()]);
  assert.equal(await saveAddonBackup(a.ports), 1);
  const b = fixture();
  b.setRemote(a.remote());
  assert.equal(await restoreAddonBackup(b.ports), 1);
  assert.deepEqual(b.local(), [addon()]);
});
test("restore preserves cached existing installations and same-ID configurations", async () => {
  const f = fixture();
  const existing = { ...addon(), manifest: { id: "example.mediafusion", name: "Example" } };
  f.setLocal([existing, addon("two")]);
  f.setRemote(encodeAddonBackup("example-profile", [addon(), addon("three")]));
  assert.equal(await restoreAddonBackup(f.ports), 1);
  assert.deepEqual(f.local(), [existing, addon("two"), addon("three")]);
  assert.equal(await restoreAddonBackup(f.ports), 0);
  assert.equal(f.writes(), 1);
});
test("restore includes local installations made while the request is in flight", async () => {
  const f = fixture();
  f.ports.pull = async () => {
    f.setLocal([addon("added-during-request")]);
    return encodeAddonBackup("example-profile", [addon()]);
  };
  await restoreAddonBackup(f.ports);
  assert.deepEqual(f.local(), [addon("added-during-request"), addon()]);
});
test("account or profile changes discard an in-flight restore", async () => {
  const f = fixture();
  f.ports.pull = async () => {
    f.changeOwner();
    return encodeAddonBackup("example-profile", [addon()]);
  };
  await assert.rejects(restoreAddonBackup(f.ports), /changed/);
  assert.equal(f.writes(), 0);
});
test("a rejected or missing backup never clears local installations", async () => {
  for (const remote of [
    null,
    "invalid",
    '{"version":2}',
    encodeAddonBackup("other-profile", [addon()]),
  ]) {
    const f = fixture();
    f.setLocal([addon("existing")]);
    f.setRemote(remote);
    await assert.rejects(restoreAddonBackup(f.ports));
    assert.deepEqual(f.local(), [addon("existing")]);
    assert.equal(f.writes(), 0);
  }
});
test("invalid and oversized backups are rejected before mutation", () => {
  for (const bad of [
    { ...addon(), transportUrl: "file:///example/manifest.json" },
    { ...addon(), transportUrl: "javascript:example" },
    { ...addon(), transportUrl: "https://addon.example/configure" },
    { ...addon(), installedAt: -1 },
    { ...addon(), id: "" },
  ])
    assert.throws(() => encodeAddonBackup("example-profile", [bad]), /invalid/);
  assert.throws(() => encodeAddonBackup("example-profile", [addon(), addon()]), /invalid/);
  assert.throws(() => decodeAddonBackup(" ".repeat(256_001), "example-profile"), /invalid/);
  assert.throws(
    () =>
      encodeAddonBackup(
        "example-profile",
        Array.from({ length: 201 }, (_, i) => addon(String(i))),
      ),
    /invalid/,
  );
});
test("empty saves cannot overwrite a usable account backup", async () => {
  const f = fixture();
  f.setRemote(encodeAddonBackup("example-profile", [addon()]));
  const before = f.remote();
  await assert.rejects(saveAddonBackup(f.ports), /Install an addon/);
  assert.equal(f.remote(), before);
});
test("network errors propagate and never produce a false successful restore", async () => {
  const f = fixture();
  f.ports.pull = async () => {
    throw new Error("offline");
  };
  await assert.rejects(restoreAddonBackup(f.ports), /offline/);
  assert.equal(f.writes(), 0);
  f.setLocal([addon()]);
  f.ports.push = async () => {
    throw new Error("offline");
  };
  await assert.rejects(saveAddonBackup(f.ports), /offline/);
});
test("a storage failure cannot report restore success", async () => {
  const f = fixture();
  f.setRemote(encodeAddonBackup("example-profile", [addon()]));
  f.ports.writeLocal = () => {
    throw new Error("storage full");
  };
  await assert.rejects(restoreAddonBackup(f.ports), /storage full/);
});
