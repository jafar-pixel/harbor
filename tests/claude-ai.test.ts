import assert from "node:assert/strict";
import test from "node:test";
import { aiKey, hasAnyAiKey, providerForModel, providerTabFor } from "../src/lib/ai-models.ts";
import { AiSearchError } from "../src/lib/ai-errors.ts";
import { claudeText } from "../src/lib/claude.ts";
import { secretName, settingKeyFromSecret } from "../src/lib/jl/account/keys.ts";
import { cleanDjSet, djPrompt } from "../src/lib/music/dj/claude-dj.ts";

const keys = { aiSearchKey: "", aiGroqKey: "", anthropicKey: "sk-ant-test" };

test("Claude model ids pick the Claude tab; OpenRouter's Claude stays on OpenRouter", () => {
  assert.equal(providerTabFor("claude-opus-5-5"), "anthropic");
  assert.equal(providerForModel("claude-haiku-5-5"), "anthropic");
  assert.equal(providerTabFor("anthropic/claude-haiku-4.5"), "openrouter");
  assert.equal(providerTabFor("llama-3.3-70b-versatile"), "groq");
});

test("the Claude tab uses the Anthropic key, and it alone turns the AI buttons on", () => {
  assert.equal(aiKey({ ...keys, aiSearchProvider: "anthropic" }), "sk-ant-test");
  assert.equal(aiKey({ ...keys, aiSearchProvider: "openrouter" }), "");
  assert.equal(hasAnyAiKey({ ...keys, aiSearchProvider: "openrouter" }), true);
  assert.equal(hasAnyAiKey({ ...keys, anthropicKey: " ", aiSearchProvider: "anthropic" }), false);
});

test("the Anthropic key is saved where family sharing can't read it", () => {
  assert.equal(secretName("anthropicKey"), "own:anthropicKey");
  assert.equal(settingKeyFromSecret("own:anthropicKey"), "anthropicKey");
  // A family owner's key under the shared prefix is never taken.
  assert.equal(settingKeyFromSecret("setting:anthropicKey"), null);
  assert.equal(secretName("rdKey"), "setting:rdKey");
  assert.equal(settingKeyFromSecret("own:rdKey"), null);
});

type Sent = { url: string; headers: Headers; body: Record<string, unknown> };

async function withFetch<T>(
  reply: (sent: Sent) => Response,
  run: () => Promise<T>,
): Promise<{ result?: T; error?: unknown; sent: Sent[] }> {
  const original = globalThis.fetch;
  const sent: Sent[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const one = {
      url: String(input instanceof Request ? input.url : input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    };
    sent.push(one);
    return reply(one);
  }) as typeof fetch;
  try {
    return { result: await run(), sent };
  } catch (error) {
    return { error, sent };
  } finally {
    globalThis.fetch = original;
  }
}

const message = (text: string, stop = "end_turn") =>
  new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text }],
      stop_reason: stop,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

test("Claude is asked from the device with the listener's key and a JSON schema", async () => {
  const schema = { type: "object", properties: {}, additionalProperties: false };
  const { result, sent } = await withFetch(
    () => message('{"results":[]}'),
    () => claudeText({ key: " sk-ant-test ", system: "sys", user: "q", schema }),
  );
  assert.equal(result, '{"results":[]}');
  assert.equal(sent.length, 1);
  const [one] = sent;
  assert.equal(one.url, "https://api.anthropic.com/v1/messages");
  assert.equal(one.headers.get("authorization"), "Bearer sk-ant-test");
  assert.equal(one.headers.get("anthropic-dangerous-direct-browser-access"), "true");
  assert.match(one.headers.get("anthropic-beta") ?? "", /server-side-fallback-2026-07-01/);
  assert.equal(one.body.model, "claude-opus-5-5");
  assert.equal(one.body.fallbacks, "default");
  assert.deepEqual(one.body.output_config, {
    effort: "low",
    format: { type: "json_schema", schema },
  });
  assert.equal(one.body.system, "sys");
});

test("a rejected key and a declined request become messages the app shows", async () => {
  const rejected = await withFetch(
    () =>
      new Response(
        JSON.stringify({
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    () => claudeText({ key: "bad", system: "s", user: "u", schema: {} }),
  );
  assert.ok(rejected.error instanceof AiSearchError);
  assert.equal(
    rejected.error.messageKey,
    "Your API key was rejected. Check it in Settings, AI search.",
  );

  const declined = await withFetch(
    () => message("", "refusal"),
    () => claudeText({ key: "k", system: "s", user: "u", schema: {} }),
  );
  assert.ok(declined.error instanceof AiSearchError);
});

test("the DJ's answer is held to the edge function's limits", () => {
  const { user, count } = djPrompt({ vibe: "beach", avoid: ["A - One"], count: 99 });
  assert.equal(count, 30);
  assert.match(user, /Vibe: beach/);
  const set = cleanDjSet(
    {
      intro: "hi",
      tracks: [
        { artist: "A", title: "One", why: "", bpm: 120, key: "8a", energy: 5 },
        { artist: "B", title: "Two", why: "w", bpm: 999, key: "13A", energy: 0 },
        { artist: "B", title: "Two", why: "dup" },
      ],
      discover: [],
      scene: "sunset",
      colors: ["#112233", "nope"],
      sounds: ["rain", "lasers"],
    },
    { avoid: ["A - One"] },
    count,
  );
  assert.deepEqual(set.tracks, [{ artist: "B", title: "Two", why: "w" }]);
  assert.equal(set.colors, null);
  assert.deepEqual(set.sounds, ["rain"]);
  assert.throws(() => djPrompt({}), /vibe/);
});
