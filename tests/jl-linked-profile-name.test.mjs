import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as documentSync from "../src/lib/jl/account/document-sync.ts";
import * as profileData from "../src/lib/jl/account/profile-data.ts";
import * as profileRemote from "../src/lib/jl/account/profile-data-remote.ts";
import * as profileMetadata from "../src/lib/jl/account/profile-metadata.ts";

for (const linked of [false, true]) {
  test(`guest adopts account name on ${linked ? "existing link" : "first sync"} and keeps saved data`, async () => {
    const key = "jl.account.data.base.v1.owner.local.remote";
    const favorite = { id: "movie", name: "Favorite" };
    const values = { "profile:name": "Jafar", "favorites:movie": favorite };
    const backup = JSON.stringify([{ key: "one" }, { key: "two" }, { key: "three" }]);
    const stored = new Map([
      [key + ".conflicts", backup],
      ["harbor.favorites.v1.local", JSON.stringify([favorite])],
    ]);
    if (linked) stored.set(key, JSON.stringify(values));
    const storage = {
      getItem: (k) => stored.get(k) ?? null,
      setItem: (k, v) => stored.set(k, v),
      removeItem: (k) => stored.delete(k),
    };
    const local = { name: "Guest 5056", color: "" };
    profileMetadata.configureJlProfileMetadata({
      read: (id) => (id === "local" ? local : null),
      write: (id, patch) => {
        assert.equal(id, "local");
        Object.assign(local, patch);
      },
    });
    const mocks = {
      "./client": {
        jlRest: async (_path, init, account) => {
          assert.equal(account.userId, "owner");
          assert.equal(init?.method, undefined);
          return Response.json([
            {
              id: "remote",
              owner: "owner",
              name: "Jafar",
              settings: { jl_harbor_v1: { revision: 2, values } },
              updated_at: "2026-10-10T00:00:00Z",
            },
          ]);
        },
      },
      "./document-sync": documentSync,
      "./profile-data": profileData,
      "./profile-data-remote": profileRemote,
      "./profile-metadata": profileMetadata,
      "@/lib/layout-sync/store": { readSettingsFor: () => ({}), writeSettingsFor: () => true },
    };
    const source = readFileSync(
      new URL("../src/lib/jl/account/profile-data-sync.ts", import.meta.url),
      "utf8",
    );
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    new Function("require", "exports", "localStorage", "window", code)(
      (id) => mocks[id],
      exports,
      storage,
      new EventTarget(),
    );
    try {
      for (let i = 0; i < 2; i++) {
        const count = await exports.syncJlProfileData({
          account: { userId: "owner" },
          localId: "local",
          profileId: "remote",
          assertCurrent() {},
        });
        assert.equal(local.name, "Jafar");
        assert.equal(count, 3);
        assert.equal(stored.get(key + ".conflicts"), backup);
        assert.deepEqual(JSON.parse(stored.get(key)), values);
        assert.deepEqual(JSON.parse(stored.get("harbor.favorites.v1.local")), [favorite]);
      }
    } finally {
      profileMetadata.configureJlProfileMetadata(null);
    }
  });
}
