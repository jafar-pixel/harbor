import { hashValue, SYNCED_SETTING_KEYS } from "./keys.ts";
import { PROFILE_PREFERENCES } from "./profile-data.ts";

/**
 * Settings that follow a profile to every device of the same kind: sign in on another desktop
 * and it looks and plays like your desktop; the web app and the Android/TV app each keep their
 * own set. The snapshot is stored encrypted in the account (`media.secrets`) next to the service
 * keys. Plain module, no I/O.
 */

export type DeviceClass = "desktop" | "web" | "android";

export function deviceClassFor(os: string): DeviceClass {
  if (os === "web") return "web";
  if (os === "android") return "android";
  return "desktop";
}

export const deviceSecretName = (profileId: string, device: DeviceClass) =>
  `device-settings:v1:${profileId}:${device}`;

/**
 * Settings that belong to one machine rather than a kind of device: folders on this disk, the
 * graphics card, attached screens and speakers, services this machine runs, and logins that
 * refresh themselves (two devices refreshing one token would sign each other out).
 */
const MACHINE_ONLY = new Set<string>([
  "streamCacheDir",
  "playbackCacheDir",
  "downloadDir",
  "ebookDownloadDir",
  "svpVpyPath",
  "customFonts",
  "audioDevice",
  "bigPictureDisplay",
  "playerSeparateDisplay",
  "playerDisplayPanel",
  "uiGraphicsBackend",
  "mpvHwdec",
  "mpvRenderer",
  "playerRtxHdr",
  "playerRtxVsr",
  "serveWebUi",
  "remoteControlEnabled",
  "defaultProfileId",
  "traktAccessToken",
  "traktRefreshToken",
  "traktExpiresAt",
]);

/** Synced elsewhere: service keys and IPTV logins (every device), and the profile preferences. */
const SYNCED_ELSEWHERE = new Set<string>([...SYNCED_SETTING_KEYS, ...PROFILE_PREFERENCES]);

/** One value larger than this (a pasted image, say) stays on the device. */
const MAX_VALUE_CHARS = 200_000;

export function isDeviceSetting(key: string): boolean {
  return !key.startsWith("_") && !MACHINE_ONLY.has(key) && !SYNCED_ELSEWHERE.has(key);
}

export type DeviceValues = Record<string, string>;
export type DeviceBase = Record<string, string>;

function portable(key: string, value: unknown): string | undefined {
  let v = value;
  if (key === "theme" && v && typeof v === "object") {
    // The background image can be a large data URL; it already stays local.
    const { backgroundImage: _drop, ...rest } = v as Record<string, unknown>;
    void _drop;
    v = rest;
  }
  return JSON.stringify(v);
}

/**
 * The device settings that differ from the defaults, as JSON strings per key, ready to compare
 * and store. Settings left at their default are not stored at all.
 */
export function deviceValues(
  settings: Record<string, unknown>,
  defaults: Record<string, unknown>,
): DeviceValues {
  const out: DeviceValues = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!isDeviceSetting(key) || value === undefined) continue;
    const json = portable(key, value);
    if (json === undefined || json.length > MAX_VALUE_CHARS) continue;
    if (json !== portable(key, defaults[key])) out[key] = json;
  }
  return out;
}

/** Turn stored JSON strings back into a settings patch (""= the default), skipping anything damaged. */
export function devicePatch(
  values: DeviceValues,
  current: Record<string, unknown>,
  defaults: Record<string, unknown>,
) {
  const patch: Record<string, unknown> = {};
  for (const [key, json] of Object.entries(values)) {
    if (!isDeviceSetting(key)) continue;
    try {
      let v = json ? (JSON.parse(json) as unknown) : structuredClone(defaults[key]);
      if (v === undefined) continue;
      if (key === "theme" && v && typeof v === "object") {
        const bg = (current.theme as Record<string, unknown> | undefined)?.backgroundImage;
        v = bg === undefined ? v : { ...(v as Record<string, unknown>), backgroundImage: bg };
      }
      patch[key] = v;
    } catch {
      /* a damaged value is left out rather than reset */
    }
  }
  return patch;
}

/** Where a device type that has never synced takes its first settings from. */
export const SEED_ORDER: Record<DeviceClass, DeviceClass[]> = {
  desktop: ["web", "android"],
  web: ["desktop", "android"],
  android: ["desktop", "web"],
};

/**
 * Settings tied to how a kind of device plays and is driven (player engine and tuning, TV
 * remote and controller input, Big Picture, window behaviour, sizes for the screen). They are
 * not carried over when a new kind of device starts from another kind's setup.
 */
const SAME_KIND_PREFIXES = ["mpv", "tv", "controller", "bigPicture", "player", "svp", "fullscreen"];
const SAME_KIND_KEYS = new Set<string>(["playerTitleScale", "playerTitleSeriesFirst"]);
const SAME_KIND_ONLY = new Set<string>([
  "uiScale",
  "posterScale",
  "rowTitleScale",
  "episodeCardScale",
  "sidebarCollapsed",
  "useNativeTitleBar",
  "hybridTitleBar",
  "closeToTray",
  "trayAlwaysOnTop",
  "pauseMinimized",
  "pauseUnfocused",
  "dragAnywhere",
  "pipBehavior",
  "instantPlay",
  "instantPlaybackPreparation",
  "streamMode",
  "directTorrentStream",
  "torrentFullDownload",
  "keepStreamDownloadsInBackground",
  "deferTorrentEngine",
  "streamCacheRetentionHours",
  "streamCacheMaxGb",
  "volumeBoostMax",
  "audioNormalize",
  "audioProfile",
  "localPlaybackMode",
  "localAutoScan",
  "localScanMode",
]);

export function carriesAcrossDevices(key: string): boolean {
  if (SAME_KIND_ONLY.has(key)) return false;
  if (SAME_KIND_KEYS.has(key)) return true;
  return !SAME_KIND_PREFIXES.some((p) => key.startsWith(p) && /[A-Z]/.test(key[p.length] ?? ""));
}

/**
 * The first settings for a device type that has none yet: the closest other type's setup,
 * without the settings that only make sense on that kind of device.
 */
export function seedDeviceValues(
  device: DeviceClass,
  snapshots: Partial<Record<DeviceClass, DeviceValues>>,
): DeviceValues {
  for (const from of SEED_ORDER[device]) {
    const source = snapshots[from];
    if (!source || !Object.keys(source).length) continue;
    const out: DeviceValues = {};
    for (const [key, value] of Object.entries(source))
      if (carriesAcrossDevices(key)) out[key] = value;
    return out;
  }
  return {};
}

export function decodeDeviceSnapshot(raw: string | undefined): DeviceValues {
  if (!raw) return {};
  try {
    const doc = JSON.parse(raw) as { version?: unknown; values?: unknown };
    if (doc.version !== 1 || !doc.values || typeof doc.values !== "object") return {};
    const out: DeviceValues = {};
    for (const [k, v] of Object.entries(doc.values as Record<string, unknown>))
      if (typeof v === "string" && isDeviceSetting(k)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function encodeDeviceSnapshot(values: DeviceValues): string {
  return JSON.stringify({ version: 1, values });
}

/**
 * Three-way merge per setting, like the service keys. A missing value means "the default", so
 * a freshly installed device has nothing to push. A side that changed since the last sync wins;
 * when both changed (a device's first sync included), the account wins, so a new device takes on
 * the profile's settings. In `push` and `apply`, "" means back to the default.
 */
export function mergeDeviceValues(
  base: DeviceBase,
  local: DeviceValues,
  remote: DeviceValues,
): { apply: DeviceValues; push: DeviceValues; base: DeviceBase; next: DeviceValues } {
  const apply: DeviceValues = {};
  const push: DeviceValues = {};
  const nextBase: DeviceBase = {};
  const next: DeviceValues = { ...remote };
  for (const key of new Set([
    ...Object.keys(local),
    ...Object.keys(remote),
    ...Object.keys(base),
  ])) {
    const l = local[key] ?? "";
    const r = remote[key] ?? "";
    const b = base[key];
    if (l === r) {
      if (l) nextBase[key] = hashValue(l);
      continue;
    }
    const localChanged = b === undefined ? !!l : hashValue(l) !== b;
    const remoteChanged = b === undefined ? !!r : hashValue(r) !== b;
    if (localChanged && !remoteChanged) {
      push[key] = l;
      if (l) {
        next[key] = l;
        nextBase[key] = hashValue(l);
      } else delete next[key];
    } else {
      apply[key] = r;
      if (r) nextBase[key] = hashValue(r);
    }
  }
  return { apply, push, base: nextBase, next };
}
