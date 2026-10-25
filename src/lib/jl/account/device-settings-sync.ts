import { osClass } from "@/lib/platform";
import { readSettingsFor, writeSettingsFor } from "@/lib/layout-sync/store";
import type { Settings } from "@/lib/settings";
import { DEFAULT } from "@/lib/settings/defaults";
import { jlRpc, type JlAccountContext } from "./client";
import {
  decodeDeviceSnapshot,
  deviceClassFor,
  devicePatch,
  deviceSecretName,
  deviceValues,
  encodeDeviceSnapshot,
  mergeDeviceValues,
  seedDeviceValues,
  type DeviceBase,
  type DeviceClass,
  type DeviceValues,
} from "./device-settings";

/** Pull and push the linked profile's settings for this kind of device (desktop, web, Android). */
export async function syncJlDeviceSettings(scope: {
  account: JlAccountContext;
  localId: string;
  profileId: string;
  assertCurrent: () => void;
}): Promise<void> {
  const device = deviceClassFor(osClass());
  const defaults = DEFAULT as unknown as Record<string, unknown>;
  const name = deviceSecretName(scope.profileId, device);
  const baseKey = `jl.account.device.base.v1.${scope.account.userId}.${scope.localId}.${scope.profileId}.${device}`;
  const read = () => {
    const value = readSettingsFor(scope.localId);
    if (!value) throw new Error("JL settings are not ready");
    return value as unknown as Record<string, unknown>;
  };

  scope.assertCurrent();
  const rows = await jlRpc<Array<{ name: string; value: string }>>(
    "get_secrets",
    {},
    scope.account,
  );
  scope.assertCurrent();
  if (!Array.isArray(rows)) throw new Error("Invalid JL settings response");
  const snapshot = (kind: DeviceClass) =>
    decodeDeviceSnapshot(
      rows.find((r) => r?.name === deviceSecretName(scope.profileId, kind))?.value,
    );
  let remote: DeviceValues = snapshot(device);

  let base: DeviceBase = {};
  try {
    const raw = localStorage.getItem(baseKey);
    if (raw) base = JSON.parse(raw) as DeviceBase;
  } catch {
    base = {};
  }

  // First time on this kind of device: start from the profile's setup on another kind.
  if (!Object.keys(remote).length && !Object.keys(base).length)
    remote = seedDeviceValues(device, {
      desktop: snapshot("desktop"),
      web: snapshot("web"),
      android: snapshot("android"),
    });

  const local = deviceValues(read(), defaults);
  const merged = mergeDeviceValues(base, local, remote);
  if (Object.keys(merged.push).length) {
    await jlRpc(
      "set_secret",
      { p_name: name, p_value: encodeDeviceSnapshot(merged.next) },
      scope.account,
    );
    scope.assertCurrent();
  }

  // Settings changed on this device while the request was out keep the local value.
  const now = deviceValues(read(), defaults);
  const apply: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged.apply))
    if (now[key] === local[key]) apply[key] = value;
  const patch = devicePatch(apply, read(), defaults);
  if (Object.keys(patch).length && !writeSettingsFor(scope.localId, patch as Partial<Settings>))
    throw new Error("JL settings could not be applied");
  localStorage.setItem(baseKey, JSON.stringify(merged.base));
}
