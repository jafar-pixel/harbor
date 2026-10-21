import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as model from "../src/lib/jl/account/addon-sync.ts";
import * as backup from "../src/lib/jl/account/addon-backup.ts";
function device(cloud) {
  let local = [],
    current = true,
    afterPull = null,
    failPush = false,
    notify = 0;
  const storage = new Map();
  const module = { exports: {} };
  const source = readFileSync(
    new URL("../src/lib/jl/account/addon-sync-client.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modules = {
    "@/lib/addon-store": {
      loadInstalled: () => local,
      saveInstalled: (v) => {
        local = v;
      },
      addonStorageProfileId: () => "local",
    },
    "./addon-backup": backup,
    "./addon-sync": model,
    "./client": {
      jlRpc: async (name, args) => {
        if (name === "get_secrets") {
          const rows = [...cloud].map(([name, value]) => ({ name, value }));
          afterPull?.();
          return rows;
        }
        if (failPush) throw Error("offline");
        if (args.p_name.length > 128) throw Error("secret name exceeds database limit");
        cloud.set(args.p_name, args.p_value);
      },
    },
  };
  new Function("require", "module", "exports", "localStorage", "window", code)(
    (id) => modules[id],
    module,
    module.exports,
    { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    { dispatchEvent: () => notify++ },
  );
  const scope = {
    account: { userId: "user" },
    localId: "local",
    profileId: "9000ee7d-d18d-45b9-8489-23947c631bf1",
    assertCurrent: () => {
      if (!current) throw Error("changed");
    },
  };
  return {
    run: () => module.exports.syncJlAddons(scope),
    set: (v) => {
      local = v;
    },
    get: () => local,
    change: () => {
      current = false;
    },
    after: (fn) => {
      afterPull = fn;
    },
    fail: (v) => {
      failPush = v;
    },
    notify: () => notify,
  };
}
const addon = (n) => ({
  id: n,
  transportUrl: "https://example.com/" + n + "/manifest.json",
  installedAt: 1,
});
test("encrypted RPC integration converges desktop and web, then propagates removal", async () => {
  const cloud = new Map(),
    d = device(cloud),
    w = device(cloud);
  d.set([addon("1"), addon("2"), addon("3"), addon("4")]);
  w.set([addon("1")]);
  await d.run();
  assert.equal([...cloud.keys()][0].length, 87);
  await w.run();
  assert.equal(w.get().length, 4);
  w.set(w.get().filter((a) => a.id !== "2"));
  await w.run();
  await d.run();
  assert.equal(d.get().length, 3);
  assert.equal(
    d.get().some((a) => a.id === "2"),
    false,
  );
});
test("account switch during pull leaves local addons untouched", async () => {
  const d = device(new Map());
  d.set([addon("1")]);
  d.after(() => d.change());
  await assert.rejects(d.run(), /changed/);
  assert.equal(d.get().length, 1);
  assert.equal(d.notify(), 0);
});
test("offline push preserves local additions for retry", async () => {
  const cloud = new Map(),
    d = device(cloud);
  d.set([addon("1")]);
  d.fail(true);
  await assert.rejects(d.run(), /offline/);
  assert.equal(d.get().length, 1);
  d.fail(false);
  await d.run();
  assert.equal(cloud.size, 1);
});
