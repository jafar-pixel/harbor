import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
function load(path, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL("../" + path, import.meta.url), "utf8"), {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", code)((id) => mocks[id], m, m.exports);
  return m.exports;
}
const { accountStartupProfile } = load("src/lib/jl/account/startup-profile.ts");
function storage(
  owner = "u",
  links = { a: { accountId: "u", status: "linked", profileId: "cloud" } },
) {
  const v = {
    "jl.account.session.v1": JSON.stringify({ userId: "u" }),
    "jl.account.workspace.owner.v1": owner,
  };
  for (const [k, l] of Object.entries(links)) v["jl.account.link.v2." + k] = JSON.stringify(l);
  return { getItem: (k) => v[k] ?? null };
}
test("account sign-in reopens a linked profile while keeping workspace and PIN boundaries", () => {
  assert.equal(accountStartupProfile([{ id: "a" }], "a", storage()), "a");
  assert.equal(accountStartupProfile([{ id: "a" }], null, storage()), "a");
  assert.equal(accountStartupProfile([{ id: "a" }], "a", storage("other")), null);
  assert.equal(accountStartupProfile([{ id: "a", passwordHash: "pin" }], "a", storage()), null);
  assert.equal(
    accountStartupProfile(
      [{ id: "a" }],
      "a",
      storage("u", { a: { accountId: "other", status: "linked", profileId: "x" } }),
    ),
    null,
  );
});
test("multiple linked profiles use the remembered profile and otherwise ask", () => {
  const s = storage("u", {
    a: { accountId: "u", status: "linked", profileId: "1" },
    b: { accountId: "u", status: "linked", profileId: "2" },
  });
  assert.equal(accountStartupProfile([{ id: "a" }, { id: "b" }], "b", s), "b");
  assert.equal(accountStartupProfile([{ id: "a" }, { id: "b" }], null, s), null);
  assert.equal(accountStartupProfile([{ id: "a" }], "a", { getItem: () => "{broken" }), null);
});
const { validAccountCommand, accountRemoteSnapshot } = load("src/lib/remote/account-wire.ts");
test("remote accepts bounded navigation and playback but rejects profile switching and malformed controls", () => {
  for (const c of [
    { action: "nav", key: "left" },
    { action: "seek", positionSec: 20 },
    { action: "setText", value: "search" },
    { action: "playMeta", metaId: "tt123", metaType: "movie" },
  ])
    assert.equal(validAccountCommand(c), true);
  for (const c of [
    { action: "setProfile", id: "private" },
    { action: "nav", key: "delete" },
    { action: "seek", positionSec: Infinity },
    { action: "setVolume", volume: 2 },
    { action: "setText" },
    { action: "setText", value: "x".repeat(2001) },
    { action: "castDiscover" },
  ])
    assert.equal(validAccountCommand(c), false);
});
test("account snapshots exclude provider keys, library dumps and LAN addresses", () => {
  const result = accountRemoteSnapshot({
    proto: 1,
    idle: true,
    tmdbKey: "secret",
    rpdbKey: "secret",
    tvdbKey: "secret",
    library: { history: ["private"] },
    castDevices: [{ host: "192.168.1.2" }],
    profile: { name: "Jafar" },
    positionSec: 2,
  });
  for (const key of ["tmdbKey", "rpdbKey", "tvdbKey", "library"])
    assert.equal(key in result, false);
  assert.deepEqual(result.castDevices, []);
  assert.equal(result.positionSec, 2);
});
const { openPrivateRemoteChannel } = load("src/lib/remote/account-channel.ts");
class Socket {
  readyState = 1;
  sent = [];
  send(raw) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  message(v) {
    this.onmessage?.({ data: JSON.stringify(v) });
  }
}
const tick = () => new Promise((r) => setImmediate(r));
test("private remote waits for authenticated join, filters topics and does not replay offline input", async () => {
  let ws;
  const received = [],
    statuses = [];
  const c = openPrivateRemoteChannel({
    url: "https://example.supabase.co",
    publicKey: "public",
    userId: "u",
    fresh: async () => ({ userId: "u", accessToken: "token" }),
    createSocket: (url) => {
      assert.ok(url.startsWith("wss:"));
      return (ws = new Socket());
    },
    receive: (v) => received.push(v),
    status: (v) => statuses.push(v),
  });
  try {
    assert.equal(c.send({ old: true }), false);
    await tick();
    ws.onopen();
    const join = ws.sent[0];
    assert.equal(join.payload.config.private, true);
    assert.equal(join.payload.access_token, "token");
    assert.equal(c.send({ early: true }), false);
    ws.message({ topic: join.topic, event: "phx_reply", ref: join.ref, payload: { status: "ok" } });
    assert.equal(c.send({ now: true }), true);
    assert.equal(ws.sent.length, 2);
    ws.message({
      topic: "realtime:jl-remote:other",
      event: "broadcast",
      payload: { event: "jl-remote", payload: "wrong" },
    });
    ws.message({
      topic: join.topic,
      event: "broadcast",
      payload: { event: "jl-remote", payload: "right" },
    });
    assert.deepEqual(received, ["right"]);
    const old = ws;
    c.reconnect();
    await tick();
    old.message({
      topic: join.topic,
      event: "broadcast",
      payload: { event: "jl-remote", payload: "stale" },
    });
    assert.deepEqual(received, ["right"]);
    assert.equal(c.send({ offline: true }), false);
  } finally {
    c.close();
  }
  assert.equal(statuses.at(-1), false);
});
test("a refreshed session for another account cannot open the remote socket", async () => {
  let opened = 0;
  const c = openPrivateRemoteChannel({
    url: "https://example.supabase.co",
    publicKey: "public",
    userId: "u",
    fresh: async () => ({ userId: "other", accessToken: "token" }),
    createSocket: () => {
      opened++;
      return new Socket();
    },
    receive: () => {},
    status: () => {},
  });
  await tick();
  c.close();
  assert.equal(opened, 0);
});

test("tablet keys use the TV key handlers once and preserve desktop navigation", () => {
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    KeyboardEvent: globalThis.KeyboardEvent,
  };
  let tv = true,
    clicks = 0;
  const events = [],
    desktop = [];
  class El {
    dispatchEvent(e) {
      events.push(e.key);
      if (e.key === "Enter") e.preventDefault();
    }
    click() {
      clicks++;
    }
  }
  class Key extends Event {
    constructor(type, o) {
      super(type, o);
      this.key = o.key;
    }
  }
  Object.assign(globalThis, {
    window: {},
    document: { documentElement: { hasAttribute: () => tv }, activeElement: new El() },
    HTMLElement: El,
    KeyboardEvent: Key,
  });
  try {
    const { injectHostNav } = load("src/lib/remote/inject-host-nav.ts", {
      "@/lib/keyboard-navigation": { dispatchTvNav: (k) => desktop.push(k) },
    });
    injectHostNav("left");
    injectHostNav("select");
    injectHostNav("back");
    assert.deepEqual(events, ["ArrowLeft", "Enter", "Escape"]);
    assert.equal(clicks, 0);
    tv = false;
    injectHostNav("right");
    assert.deepEqual(desktop, ["right"]);
  } finally {
    Object.assign(globalThis, saved);
  }
});

test("direction buttons send immediately, avoid duplicate clicks and stop when capture is lost", () => {
  const old = globalThis.window,
    commands = [],
    timers = new Map(),
    cleanups = [];
  let seq = 0;
  globalThis.window = {
    setTimeout: (fn, delay) => {
      const id = ++seq;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    matchMedia: () => ({ matches: false }),
  };
  const jsx = (type, props) => ({ type, props });
  const noop = () => {};
  const mocks = {
    react: {
      useEffect: (fn) => {
        const c = fn();
        if (c) cleanups.push(c);
      },
      useRef: (v) => ({ current: v }),
      useState: (v) => [typeof v === "function" ? v() : v, noop],
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "lucide-react": {},
    "@/lib/providers/streaming": { SERVICES: {} },
    "@/lib/i18n": { useT: () => (x) => x },
    "./mobile-remote": {
      useMobileRemote: () => ({
        sendCommand: (c) => commands.push(c),
        snapshot: { idle: true, target: { label: "TV" } },
        connected: true,
      }),
    },
    "./mobile-sheet-lock": { useRegisterSheet: noop },
    "./mobile-services": {},
    "./renderer-sheet": {},
    "./remote-extras": {},
    "./voice-search": {},
  };
  try {
    const { DpadRemote } = load("src/views/mobile/dpad-remote.tsx", mocks);
    const tree = DpadRemote();
    const find = (node) => {
      if (!node || typeof node !== "object") return null;
      if (node.props?.["aria-label"] === "Up") return node;
      for (const child of [node.props?.children].flat(Infinity)) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    };
    const up = find(tree);
    assert.ok(up);
    up.props.onPointerDown({
      isPrimary: true,
      button: 0,
      pointerId: 1,
      currentTarget: { setPointerCapture: noop },
    });
    assert.deepEqual(commands, [{ action: "nav", key: "up" }]);
    up.props.onClick({ detail: 1 });
    assert.equal(commands.length, 1);
    const repeat = [...timers.values()].find((x) => x.delay === 380);
    repeat.fn();
    assert.equal(commands.length, 2);
    up.props.onLostPointerCapture();
    assert.equal(
      [...timers.values()].some((x) => x.delay < 120),
      false,
    );
    up.props.onClick({ detail: 0 });
    assert.equal(commands.length, 3);
  } finally {
    for (const c of cleanups) c();
    globalThis.window = old;
  }
});

test("a temporarily unavailable session refresh schedules a retry", async () => {
  const original = globalThis.setTimeout;
  let scheduled = false;
  globalThis.setTimeout = (fn, ms) => {
    scheduled = ms === 3000;
    return original(() => {}, 0);
  };
  const c = openPrivateRemoteChannel({
    url: "https://example.supabase.co",
    publicKey: "public",
    userId: "u",
    fresh: async () => null,
    createSocket: () => {
      throw Error("must not connect");
    },
    receive: () => {},
    status: () => {},
  });
  try {
    await tick();
    assert.equal(scheduled, true);
  } finally {
    c.close();
    globalThis.setTimeout = original;
  }
});

test("full app navigation keeps Explore and Remote available together", () => {
  const jsx = (type, props) => ({ type, props });
  const { BottomTabBar } = load("src/views/mobile/bottom-tab-bar.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "lucide-react": {},
    "@/components/icons/search-icon": {},
    "@/lib/profiles": { useProfiles: () => ({ activeProfile: null }) },
    "@/lib/i18n": { useT: () => (x) => x },
    "./mobile-remote": { useMobileRemote: () => ({ snapshot: {}, remoteMode: false }) },
    "./mobile-sheet-lock": { useSheetLock: () => ({ sheetOpen: false }) },
  });
  const labels = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.props?.["aria-label"]) labels.push(node.props["aria-label"]);
    for (const child of [node.props?.children].flat(Infinity)) visit(child);
  }
  visit(BottomTabBar({ active: "home", onSelect: () => {} }));
  assert.ok(labels.includes("Explore"));
  assert.ok(labels.includes("Remote"));
  assert.ok(labels.includes("Home"));
});
