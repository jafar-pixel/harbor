import { areaFit, classifyByRules, type AgentLabel } from "./classify.ts";

/**
 * What the Sports agent knows about the viewer's channels: Claude's answers for names the rules
 * can't place, and the viewer's own edits (hide, pin), which always win. Kept on this device by
 * channel name, so a provider refresh keeps them. Both game pickers (the Sports Hub and the game
 * pages) read it here, so they always agree.
 */

const LABELS_KEY = "jl.sports.agent.labels.v1";
const EDITS_KEY = "jl.sports.agent.edits.v1";
const MAX_LABELS = 20_000;

export type AgentEdit = "hide" | "pin";

let labels: Record<string, AgentLabel> | null = null;
let edits: Record<string, AgentEdit> | null = null;
let area = { state: "", city: "" };
let version = 0;
const listeners = new Set<() => void>();
const rulesMemo = new Map<string, AgentLabel | null>();

/** Channels are known by name, without case or extra spaces. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function read<T>(key: string): T | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: kept for this session */
  }
}

function changed(): void {
  version += 1;
  for (const l of listeners) l();
}

function allLabels(): Record<string, AgentLabel> {
  labels ??= read<Record<string, AgentLabel>>(LABELS_KEY) ?? {};
  return labels;
}

function allEdits(): Record<string, AgentEdit> {
  edits ??= read<Record<string, AgentEdit>>(EDITS_KEY) ?? {};
  return edits;
}

/** What a channel is: the viewer's word, then Claude's, then the rules'. */
export function agentLabel(name: string): AgentLabel | null {
  const key = nameKey(name);
  const ai = allLabels()[key];
  if (ai) return ai;
  if (!rulesMemo.has(key)) rulesMemo.set(key, classifyByRules(name));
  return rulesMemo.get(key) ?? null;
}

export function agentEdit(name: string): AgentEdit | null {
  return allEdits()[nameKey(name)] ?? null;
}

export function setAgentEdit(name: string, edit: AgentEdit | null): void {
  const next = { ...allEdits() };
  const key = nameKey(name);
  if (edit) next[key] = edit;
  else delete next[key];
  edits = next;
  write(EDITS_KEY, next);
  changed();
}

/** Saves Claude's answers (ai-sort.ts). */
export function saveAgentLabels(found: Record<string, AgentLabel>): void {
  const next = { ...allLabels(), ...found };
  const keys = Object.keys(next);
  labels =
    keys.length > MAX_LABELS
      ? Object.fromEntries(keys.slice(-MAX_LABELS).map((k) => [k, next[k]]))
      : next;
  write(LABELS_KEY, labels);
  changed();
}

/** Whether Claude has already answered for this name (so it is never asked twice). */
export function hasAgentLabel(name: string): boolean {
  return nameKey(name) in allLabels();
}

export function agentLabelCount(): number {
  return Object.keys(allLabels()).length;
}

/** Forget Claude's answers (the viewer's edits stay). */
export function clearAgentLabels(): void {
  labels = {};
  write(LABELS_KEY, labels);
  changed();
}

/** Set by the settings provider: the viewer's state and city (Settings › Sports › Your area). */
export function setAgentArea(state: string, city: string): void {
  const next = { state: state.trim(), city: city.trim() };
  if (next.state === area.state && next.city === area.city) return;
  area = next;
  changed();
}

export function agentArea(): { state: string; city: string } {
  return area;
}

/** How well a local station or team channel fits the viewer's area: 2 city, 1 state, 0 not. */
export function channelAreaFit(name: string): number {
  const label = agentLabel(name);
  if (!label || (label.kind !== "local" && label.kind !== "team")) return 0;
  return areaFit(label, area);
}

/** Changes whenever a label, an edit or the area changes; game pickers key their caches on it. */
export function agentVersion(): number {
  return version;
}

export function subscribeAgent(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The schedule's network names compared loosely: "FanDuel SN Ohio" = "fanduelsnohio". */
export function networkKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9+]/g, "");
}

/** Test hook. */
export function resetAgentStore(): void {
  labels = {};
  edits = {};
  area = { state: "", city: "" };
  rulesMemo.clear();
  changed();
}
