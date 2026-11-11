import { useSyncExternalStore } from "react";
import { genreByRules, type LiveLabel } from "./genre.ts";

/**
 * What the Live TV agent knows about the viewer's channels: Claude's answers for names the rules
 * can't place, and the viewer's own edits (hide, pin), which always win. Kept on this device by
 * channel name, so a provider refresh keeps them.
 */

const LABELS_KEY = "jl.live.agent.labels.v1";
const EDITS_KEY = "jl.live.agent.edits.v1";
const MAX_LABELS = 30_000;

export type LiveEdit = "hide" | "pin";

let labels: Record<string, LiveLabel> | null = null;
let edits: Record<string, LiveEdit> | null = null;
let version = 0;
const listeners = new Set<() => void>();
const rulesMemo = new Map<string, LiveLabel | null>();

/** Channels are known by name, without case or extra spaces. */
export function liveNameKey(name: string): string {
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

function allLabels(): Record<string, LiveLabel> {
  labels ??= read<Record<string, LiveLabel>>(LABELS_KEY) ?? {};
  return labels;
}

function allEdits(): Record<string, LiveEdit> {
  edits ??= read<Record<string, LiveEdit>>(EDITS_KEY) ?? {};
  return edits;
}

/** What a channel is: Claude's answer, then the rules'. */
export function liveLabel(name: string, group?: string | null): LiveLabel | null {
  const key = liveNameKey(name);
  const ai = allLabels()[key];
  if (ai) return ai;
  const memoKey = `${key}\u0000${group ?? ""}`;
  if (!rulesMemo.has(memoKey)) rulesMemo.set(memoKey, genreByRules(name, group));
  return rulesMemo.get(memoKey) ?? null;
}

export function liveEdit(name: string): LiveEdit | null {
  return allEdits()[liveNameKey(name)] ?? null;
}

export function setLiveEdit(name: string, edit: LiveEdit | null): void {
  const next = { ...allEdits() };
  const key = liveNameKey(name);
  if (edit) next[key] = edit;
  else delete next[key];
  edits = next;
  write(EDITS_KEY, next);
  changed();
}

/** Saves Claude's answers (ai-sort.ts). */
export function saveLiveLabels(found: Record<string, LiveLabel>): void {
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
export function hasLiveLabel(name: string): boolean {
  return liveNameKey(name) in allLabels();
}

export function liveLabelCount(): number {
  return Object.keys(allLabels()).length;
}

/** Forget Claude's answers (the viewer's edits stay). */
export function clearLiveLabels(): void {
  labels = {};
  write(LABELS_KEY, labels);
  changed();
}

export function liveAgentVersion(): number {
  return version;
}

export function subscribeLiveAgent(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useLiveAgentVersion(): number {
  return useSyncExternalStore(subscribeLiveAgent, liveAgentVersion, liveAgentVersion);
}

/** Test hook. */
export function resetLiveAgentStore(): void {
  labels = {};
  edits = {};
  rulesMemo.clear();
  changed();
}
