import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const LOOPBACK = "http://localhost:8899/youtube";

type Auth = {
  connectYouTubeWeb: (edit?: boolean) => Promise<void>;
  youtubeWebState: () => { connected: boolean; linked: boolean; error: string | null };
};

/** Loads auth.ts as the desktop app sees it, with Google's answer faked by `reply`. */
function desktop(options: { account?: boolean; reply: (url: URL) => string | Promise<string> }) {
  const source = readFileSync(
    new URL("../src/lib/music/youtube-web/auth.ts", import.meta.url),
    "utf8",
  ).replace(/import\.meta\.env\.\w+/g, "undefined");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const window = { __TAURI_INTERNALS__: {}, location: { origin: "tauri://localhost" } };
  const calls: { invoked: { cmd: string; url: URL }[]; exchanged: unknown[] } = {
    invoked: [],
    exchanged: [],
  };
  class MusicLinkError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  const mocks: Record<string, unknown> = {
    react: { useSyncExternalStore: () => null },
    "@tauri-apps/api/core": {
      invoke: async (cmd: string, args: { url: string }) => {
        const url = new URL(args.url);
        calls.invoked.push({ cmd, url });
        return options.reply(url);
      },
    },
    "../account-link": {
      accountLinksOn: () => !!options.account,
      accountMusicToken: async () => "account-token",
      disconnectMusicLink: async () => {},
      exchangeMusicLink: async (provider: string, body: unknown) => {
        calls.exchanged.push({ provider, body });
      },
      markYouTubeServerOff: () => {},
      MusicLinkError,
      musicLinkState: () => ({ links: {}, youtubeServer: !!options.account }),
      subscribeMusicLinks: () => () => {},
      useMusicLinks: () => null,
    },
  };
  const exports = {} as Auth;
  new Function("require", "exports", "window", "localStorage", "crypto", compiled)(
    (id: string) => {
      assert.ok(id in mocks, id);
      return mocks[id];
    },
    exports,
    window,
    localStorage,
    globalThis.crypto,
  );
  return { auth: exports, calls, store };
}

test("the desktop app signs in through the default browser and keeps the token", async () => {
  const { auth, calls, store } = desktop({
    reply: (url) =>
      `access_token=tok&expires_in=3600&token_type=Bearer&state=${url.searchParams.get("state")}`,
  });
  await auth.connectYouTubeWeb();

  assert.equal(calls.invoked.length, 1);
  const { cmd, url } = calls.invoked[0];
  assert.equal(cmd, "youtube_browser_signin");
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("redirect_uri"), LOOPBACK);
  assert.equal(url.searchParams.get("response_type"), "token");
  assert.deepEqual(auth.youtubeWebState(), { connected: true, linked: true, error: null });
  assert.equal(JSON.parse(store.get("jl.youtube.web.v1") ?? "{}").access, "tok");
});

test("with a JL account the code goes to the account with the loopback address", async () => {
  const { auth, calls } = desktop({
    account: true,
    reply: (url) => `code=abc&scope=x&state=${url.searchParams.get("state")}`,
  });
  await auth.connectYouTubeWeb(true);

  const url = calls.invoked[0].url;
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/youtube");
  assert.deepEqual(calls.exchanged, [
    { provider: "youtube", body: { code: "abc", redirectUri: LOOPBACK } },
  ]);
  assert.equal(auth.youtubeWebState().connected, true);
});

test("an answer for another sign in is refused", async () => {
  const { auth, store } = desktop({ reply: () => "access_token=tok&state=someone-else" });
  await auth.connectYouTubeWeb();

  assert.equal(auth.youtubeWebState().connected, false);
  assert.match(auth.youtubeWebState().error ?? "", /expired/);
  assert.equal(store.get("jl.youtube.web.v1"), undefined);
});

test("a cancelled or failed browser sign in shows why", async () => {
  const cancelled = desktop({
    reply: (url) => `error=access_denied&state=${url.searchParams.get("state")}`,
  });
  await cancelled.auth.connectYouTubeWeb();
  assert.equal(cancelled.auth.youtubeWebState().error, "Google sign in was cancelled.");

  const failed = desktop({
    reply: () => Promise.reject("Google sign in needs port 8899."),
  });
  await failed.auth.connectYouTubeWeb();
  assert.equal(failed.auth.youtubeWebState().error, "Google sign in needs port 8899.");
  assert.equal(failed.auth.youtubeWebState().connected, false);
});
