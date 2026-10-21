import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
test("sign-in links an existing account profile even when the local profile has a placeholder name", () => {
  let attempts = 0;
  const source = readFileSync(
    new URL("../src/components/jl-account-sync.tsx", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  const mocks = {
    react: { useRef: (v) => ({ current: v }), useEffect: (fn) => fn() },
    "@/lib/jl/account/client": { useJlSession: () => ({ userId: "user" }) },
    "@/lib/jl/account/keys-sync": { useJlKeySync: () => {} },
    "@/lib/profiles": {
      useProfiles: () => ({ activeProfile: { id: "local", name: "Me" }, profiles: [] }),
      isPlaceholderName: () => true,
    },
    "@/lib/jl/account/profile-metadata": { configureJlProfileMetadata: () => {} },
    "@/lib/jl/account/sync": {
      useJlLink: () => null,
      useJlSync: () => {},
      jlProfileContext: () => ({ account: { userId: "user" }, localId: "local" }),
      autoLinkJlProfile: async () => {
        attempts++;
      },
    },
  };
  new Function("require", "module", "exports", "window", "document", code)(
    (id) => mocks[id],
    module,
    module.exports,
    { addEventListener: () => {}, removeEventListener: () => {} },
    { addEventListener: () => {}, removeEventListener: () => {} },
  );
  module.exports.JlAccountSync();
  assert.equal(attempts, 1);
});
