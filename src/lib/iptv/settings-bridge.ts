import type { XtreamContainer } from "./xtream";

const STORAGE_KEY = "harbor.settings";

// Guide matching asks for the offset once per channel; a provider with 20,000 channels made that
// 20,000 reads and parses of the whole settings blob. A second-old copy is fresh enough.
let cached: { at: number; value: Record<string, unknown> } | null = null;

function readSettings(): Record<string, unknown> {
  const now = Date.now();
  if (cached && now - cached.at < 1000) return cached.value;
  const value = readSettingsNow();
  cached = { at: now, value };
  return value;
}

function readSettingsNow(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function liveContainerPref(): XtreamContainer {
  const v = readSettings().iptvLiveContainer;
  return v === "m3u8" ? "m3u8" : "ts";
}

export function epgOffsetHoursPref(): number {
  const v = readSettings().iptvEpgOffsetHours;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
