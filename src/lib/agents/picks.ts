import { useEffect, useRef, useState } from "react";
import { claudeText } from "@/lib/claude";
import type { Meta } from "@/lib/cinemeta";
import { weeklyPool, type WeeklyKind } from "@/lib/weekly-top";
import { picksFromAnswer, type AgentPick } from "./picks-core";

export type { AgentPick };

/**
 * The Movies & Shows agent: once a day Claude picks the viewer's ten for tonight from this
 * week's popular titles, weighed against what they have been watching, with a line on why. It
 * runs with the viewer's own Anthropic key, and the picks are kept on this device until the next
 * day (or a refresh).
 */

const CACHE_KEY = "jl.agent.picks.v1";

type Cached = { day: string; picks: AgentPick[] };

const SYSTEM = `You are a TV app's movie and TV show recommender.
From the numbered list of this week's popular titles, choose the ten this viewer is most likely
to enjoy tonight, best first, using what they have been watching. Prefer variety across genres,
and don't pick titles they are already watching. For each, write "why": one short sentence
(at most 12 words) addressed to the viewer, e.g. "Same slow-burn tension as Severance."
If they have watched nothing yet, choose a varied, well-reviewed ten. Reply with JSON only.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["picks"],
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "why"],
        properties: { i: { type: "integer" }, why: { type: "string" } },
      },
    },
  },
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readCache(): Record<string, Cached> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as Record<string, Cached>) : {};
  } catch {
    return {};
  }
}

function writeCache(kind: WeeklyKind, picks: AgentPick[]): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...readCache(), [kind]: { day: today(), picks } }),
    );
  } catch {
    /* storage blocked: kept for this session */
  }
}

/** Today's picks if they were already made on this device. */
export function cachedPicks(kind: WeeklyKind): AgentPick[] | null {
  const hit = readCache()[kind];
  return hit && hit.day === today() && hit.picks.length ? hit.picks : null;
}

function describe(m: Meta): string {
  const bits = [m.releaseInfo, m.genres?.slice(0, 3).join("/")].filter(Boolean).join(", ");
  return bits ? `${m.name} (${bits})` : m.name;
}

/** Asks Claude for tonight's ten and keeps them for the day. */
export async function makePicks(
  account: { key: string; model: string },
  kind: WeeklyKind,
  tmdbKey: string,
  watching: readonly string[],
  signal?: AbortSignal,
): Promise<AgentPick[]> {
  const watchingKeys = new Set(watching.map((n) => n.toLowerCase()));
  const pool = (await weeklyPool(kind, tmdbKey)).filter(
    (m) => m.name && !watchingKeys.has(m.name.toLowerCase()),
  );
  if (!pool.length) return [];
  const raw = await claudeText({
    ...account,
    system: SYSTEM,
    user: [
      `Kind: ${kind === "movie" ? "movies" : "TV shows"}`,
      `Recently watching: ${watching.length ? watching.slice(0, 20).join("; ") : "nothing yet"}`,
      "This week's popular titles:",
      ...pool.map((m, i) => `${i}. ${describe(m)}`),
    ].join("\n"),
    schema: SCHEMA,
    maxTokens: 8000,
    signal,
  });
  const picks = picksFromAnswer(raw, pool);
  if (picks.length) writeCache(kind, picks);
  return picks;
}

export type PicksState = {
  picks: AgentPick[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * Tonight's picks for a row: today's from this device, else made now (once a day) when the viewer
 * has an Anthropic key. Without a key the row stays empty.
 */
export function useAgentPicks(
  kind: WeeklyKind,
  account: { key: string; model: string } | null,
  tmdbKey: string,
  watching: readonly string[],
): PicksState {
  const [picks, setPicks] = useState<AgentPick[]>(() => cachedPicks(kind) ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = account?.key ?? "";
  const model = account?.model ?? "";
  // The latest history, read when Claude is asked (it loads after the page does).
  const watchingRef = useRef(watching);
  watchingRef.current = watching;
  const hasHistory = watching.length > 0;

  useEffect(() => {
    if (!key) return;
    if (nonce === 0 && cachedPicks(kind)) return;
    const ctrl = new AbortController();
    // Give the viewer's history a moment to load before the day's picks are made without it.
    const wait = nonce === 0 && !hasHistory ? 6000 : 0;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      makePicks({ key, model }, kind, tmdbKey, watchingRef.current, ctrl.signal)
        .then((p) => {
          if (!ctrl.signal.aborted && p.length) setPicks(p);
        })
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, wait);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, model, kind, tmdbKey, nonce, hasHistory]);

  return { picks, loading, error, refresh: () => setNonce((n) => n + 1) };
}
