/** The AI features' errors, as messages the interface can translate. Plain module, no I/O. */

export type AiErrorMessageKey =
  | "Your API key was rejected. Check it in Settings, AI search."
  | "Your account is out of credits for this model. Pick a free model or top up."
  | "This model no longer exists at the provider. Pick another model (hold the AI button)."
  | "That request was too big for this model. Pick a model with a larger context."
  | "The model is rate-limited right now. Try again in a moment or switch models."
  | "The model replied with nothing usable. Try another model (hold the AI button) or rephrase."
  | "AI search failed ({status})."
  | "AI search failed.";

export type AiErrorDescriptor = {
  messageKey: AiErrorMessageKey;
  values?: { status: number };
  detail?: string;
};

export class AiSearchError extends Error {
  readonly messageKey: AiErrorMessageKey;
  readonly values?: { status: number };
  readonly detail?: string;

  constructor({ messageKey, values, detail }: AiErrorDescriptor) {
    const sourceMessage = values
      ? messageKey.replace("{status}", String(values.status))
      : messageKey;
    super(detail ? `${sourceMessage} ${detail}` : sourceMessage);
    this.name = "AiSearchError";
    this.messageKey = messageKey;
    this.values = values;
    this.detail = detail;
  }
}

export function friendlyAiError(status: number, detail = ""): AiErrorDescriptor {
  const rawDetail = detail.slice(0, 140).trim();
  const error =
    status === 401
      ? { messageKey: "Your API key was rejected. Check it in Settings, AI search." as const }
      : status === 402
        ? {
            messageKey:
              "Your account is out of credits for this model. Pick a free model or top up." as const,
          }
        : status === 404
          ? {
              messageKey:
                "This model no longer exists at the provider. Pick another model (hold the AI button)." as const,
            }
          : status === 413
            ? {
                messageKey:
                  "That request was too big for this model. Pick a model with a larger context." as const,
              }
            : status === 429
              ? {
                  messageKey:
                    "The model is rate-limited right now. Try again in a moment or switch models." as const,
                }
              : status
                ? {
                    messageKey: "AI search failed ({status})." as const,
                    values: { status },
                  }
                : { messageKey: "AI search failed." as const };
  return rawDetail ? { ...error, detail: rawDetail } : error;
}
