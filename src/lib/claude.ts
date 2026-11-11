import Anthropic from "@anthropic-ai/sdk";
import { AiSearchError, friendlyAiError } from "./ai-errors";
import { DEFAULT_CLAUDE_MODEL, isClaudeModel } from "./ai-models";

/**
 * Claude with the listener's own Anthropic key, straight from this device: the key is theirs, so
 * only they are billed, and it never passes through a JL server. AI search, episode and game
 * search, and Ask JL / the AI DJ use it when an Anthropic key is saved in Settings › AI.
 */

let account = { key: "", model: "" };

/** Set by the settings provider on every change, like the other service keys. */
export function setClaudeAccount(key: string, model: string): void {
  account = { key: key.trim(), model: isClaudeModel(model) ? model.trim() : "" };
}

/** The saved key and model, or null without a key. */
export function claudeAccount(): { key: string; model: string } | null {
  return account.key ? { key: account.key, model: account.model || DEFAULT_CLAUDE_MODEL } : null;
}

export type ClaudeRequest = {
  key: string;
  model?: string;
  system: string;
  user: string;
  /** The reply's JSON schema; Claude's answer is held to it (structured outputs). */
  schema: Record<string, unknown>;
  /** Room for adaptive thinking as well as the answer. */
  maxTokens?: number;
  signal?: AbortSignal;
};

/** Claude's reply as JSON text that matches `schema`. Errors are AiSearchError. */
export async function claudeText({
  key,
  model,
  system,
  user,
  schema,
  maxTokens = 8000,
  signal,
}: ClaudeRequest): Promise<string> {
  const client = new Anthropic({
    apiKey: key.trim(),
    // The key is the listener's own, typed into their own app, and calls go from their device.
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  });
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages.create(
      {
        model: model && isClaudeModel(model) ? model : DEFAULT_CLAUDE_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
        // Search and DJ picks are quick answers from what Claude knows; low effort keeps them fast.
        output_config: { effort: "low", format: { type: "json_schema", schema } },
        // When a model declines, Anthropic retries on its default substitute model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal },
    );
  } catch (error) {
    throw claudeError(error);
  }
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
    throw new AiSearchError({
      messageKey:
        "The model replied with nothing usable. Try another model (hold the AI button) or rephrase.",
    });
  }
  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
  if (!text) {
    throw new AiSearchError({
      messageKey:
        "The model replied with nothing usable. Try another model (hold the AI button) or rephrase.",
    });
  }
  return text;
}

function claudeError(error: unknown): unknown {
  if (error instanceof Anthropic.APIUserAbortError) return error;
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiSearchError({ messageKey: "AI search failed.", detail: error.message });
  }
  if (error instanceof Anthropic.APIError) {
    const detail = error.message ?? "";
    // Anthropic answers an empty balance with 400 "credit balance is too low".
    const status = error.status === 400 && /credit balance/i.test(detail) ? 402 : error.status;
    return new AiSearchError(friendlyAiError(status ?? 0, detail));
  }
  return error;
}
