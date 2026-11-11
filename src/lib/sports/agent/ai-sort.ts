import { claudeText } from "@/lib/claude";
import type { IptvChannel } from "@/lib/iptv/types";
import { classifyByRules, US_STATES, type AgentKind, type AgentLabel } from "./classify";
import { hasAgentLabel, nameKey, saveAgentLabels } from "./store";

/**
 * The Sports agent's Claude step: names the rules can't place (regional sports networks, team
 * feeds, foreign sports channels) are sent to Claude with the viewer's own Anthropic key, in
 * batches, and every answer is saved so a name is only ever asked about once.
 */

const BATCH = 120;
const SPORTY =
  /sport|espn|fox|nbc|cbs|abc|tnt|tbs|bally|fanduel|msg|nesn|yes network|marquee|spectrum|root|altitude|nfl|nba|nhl|mlb|ncaa|soccer|football|basket|baseball|hockey|tennis|golf|ufc|boxing|fight|racing|motor|dazn|bein|tsn|sportsnet/i;

const SYSTEM = `You sort a viewer's IPTV channel names for a sports app in the United States.
For each channel name, say what it is:
- "network": a linear TV network. Give "network" as ESPN's broadcast listings name it, e.g. "ESPN", "ESPN2", "FS1", "TNT", "NBC Sports Chicago", "FanDuel SN Ohio" (the former Bally Sports networks), "MSG", "NESN", "YES", "Marquee Sports Network", "SportsNet LA", "Spectrum SportsNet", "Root Sports", "Altitude", "TSN1", "Sportsnet ONE". A team-named feed ("USA St Louis Cardinals") is the team's regional network.
- "local": a local over-the-air station; give its "network" (ABC, CBS, FOX, NBC, CW, PBS), "state" (two letters) and "city" when the name shows them.
- "event": a numbered event slot or pay-per-view feed; give "league" when the name shows it (NFL, NBA, NHL, MLB, NCAAF, NCAAB, MLS, UFC).
- "team": a channel for one team's games on a broadcast network; give "league", "network", "city", "state".
- "other": not sports.
Use null for anything the name doesn't show. Never guess a network you don't recognise; use "other".
Reply with JSON only.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["channels"],
  properties: {
    channels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "kind", "network", "league", "state", "city"],
        properties: {
          i: { type: "integer" },
          kind: { type: "string", enum: ["network", "local", "event", "team", "other"] },
          network: { anyOf: [{ type: "string" }, { type: "null" }] },
          league: { anyOf: [{ type: "string" }, { type: "null" }] },
          state: { anyOf: [{ type: "string" }, { type: "null" }] },
          city: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
};

/** The channel names Claude would be asked about: sports-looking, unplaced by rules, unanswered. */
export function namesForClaude(channels: readonly IptvChannel[]): string[] {
  const out = new Map<string, string>();
  for (const c of channels) {
    if (!c.name || out.has(nameKey(c.name))) continue;
    if (!SPORTY.test(c.name) && !SPORTY.test(c.group ?? "")) continue;
    if (classifyByRules(c.name) || hasAgentLabel(c.name)) continue;
    out.set(nameKey(c.name), c.name);
  }
  return [...out.values()];
}

/** Turns one answer row into a label, keeping only well-formed fields. */
export function labelFromAnswer(row: Record<string, unknown>): AgentLabel {
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
  const kinds: AgentKind[] = ["network", "local", "event", "team", "other"];
  const kind = kinds.includes(row.kind as AgentKind) ? (row.kind as AgentKind) : "other";
  const state = str(row.state, 2)?.toUpperCase();
  return {
    kind,
    network: str(row.network, 60),
    league: str(row.league, 12)?.toUpperCase(),
    state: state && US_STATES.has(state) ? state : undefined,
    city: str(row.city, 60)?.toLowerCase(),
    by: "ai",
  };
}

export type SortProgress = { done: number; total: number };

/** Sorts the unplaced names with Claude and saves the answers; returns how many were sorted. */
export async function sortWithClaude(
  account: { key: string; model: string },
  channels: readonly IptvChannel[],
  onProgress?: (p: SortProgress) => void,
  signal?: AbortSignal,
): Promise<number> {
  const names = namesForClaude(channels);
  let done = 0;
  onProgress?.({ done, total: names.length });
  for (let at = 0; at < names.length; at += BATCH) {
    signal?.throwIfAborted();
    const batch = names.slice(at, at + BATCH);
    const raw = await claudeText({
      ...account,
      system: SYSTEM,
      user: batch.map((n, i) => `${i}. ${n}`).join("\n"),
      schema: SCHEMA,
      maxTokens: 16000,
      signal,
    });
    let rows: unknown = [];
    try {
      rows = (JSON.parse(raw) as { channels?: unknown }).channels ?? [];
    } catch {
      rows = [];
    }
    const found: Record<string, AgentLabel> = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const r = (row ?? {}) as Record<string, unknown>;
      const name = batch[Number(r.i)];
      if (name) found[nameKey(name)] = labelFromAnswer(r);
    }
    // Names Claude skipped count as asked, so they aren't sent again.
    for (const name of batch) found[nameKey(name)] ??= { kind: "other", by: "ai" };
    saveAgentLabels(found);
    done += batch.length;
    onProgress?.({ done, total: names.length });
  }
  return done;
}
