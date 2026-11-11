import type { Meta } from "@/lib/cinemeta";

/** The Movies & Shows agent's answer handling (plain module, no I/O). */

export type AgentPick = { meta: Meta; why: string };

export const PICKS = 10;

/** Turns Claude's answer into picks from the pool, dropping repeats and bad indexes. */
export function picksFromAnswer(raw: string, pool: readonly Meta[]): AgentPick[] {
  let rows: unknown = [];
  try {
    rows = (JSON.parse(raw) as { picks?: unknown }).picks ?? [];
  } catch {
    rows = [];
  }
  const out: AgentPick[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const r = (row ?? {}) as Record<string, unknown>;
    const meta = pool[Number(r.i)];
    if (!meta || seen.has(meta.id)) continue;
    seen.add(meta.id);
    const why = typeof r.why === "string" ? r.why.trim().slice(0, 140) : "";
    out.push({ meta, why });
    if (out.length >= PICKS) break;
  }
  return out;
}
