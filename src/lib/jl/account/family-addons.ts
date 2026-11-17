import {
  addonStorageProfileId,
  installAddon,
  loadInstalled,
  uninstallAddon,
} from "@/lib/addon-store";
import { decodeAddonBackup, encodeAddonBackup, type PortableAddon } from "./addon-backup";
import { jlRpc, type JlAccountContext } from "./client";
import { planFamilyAddons } from "./family-addons-plan";

/**
 * Cloning the owner's add-ons to their JL family. With "Share my add-ons" on, the owner's
 * installed add-ons are kept in a family-shared setting (media.secrets, "setting:" names are what
 * get_family_secrets hands to members). A member's app installs them and remembers which ones it
 * added, so it removes exactly those when the owner stops sharing or the member leaves; add-ons
 * the member installed themselves are never touched. Older app versions ignore the setting.
 */

export const FAMILY_ADDONS_SECRET = "setting:familyAddons";
const SNAPSHOT_PROFILE = "family";
/** Transport URLs this device installed from the family. */
const ADDED_KEY = "jl.family.addons.added.v1";

type SecretRow = { name: string; value: string };

function readAdded(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ADDED_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

function writeAdded(urls: string[]): void {
  try {
    localStorage.setItem(ADDED_KEY, JSON.stringify(urls));
  } catch {
    /* storage full: the next run works it out again from the shared list */
  }
}

function rows(value: unknown): SecretRow[] {
  if (!Array.isArray(value)) throw new Error("Invalid JL secrets response");
  return value.filter(
    (r): r is SecretRow => !!r && typeof r.name === "string" && typeof r.value === "string",
  );
}

function decodeShared(value: string | undefined): PortableAddon[] {
  if (!value) return [];
  try {
    return decodeAddonBackup(value, SNAPSHOT_PROFILE);
  } catch {
    return [];
  }
}

/** This device's installed add-ons as the family snapshot. */
function ownSnapshot(): string | null {
  const list = loadInstalled().map(({ id, transportUrl, installedAt }) => ({
    id,
    transportUrl,
    installedAt,
  }));
  if (!list.length) return null;
  try {
    return encodeAddonBackup(SNAPSHOT_PROFILE, list);
  } catch {
    return null;
  }
}

/** Whether the owner is sharing their add-ons (the setting exists on their account). */
export async function familyAddonsShared(account?: JlAccountContext): Promise<boolean> {
  const own = rows(await jlRpc<unknown>("get_secrets", {}, account));
  return own.some((r) => r.name === FAMILY_ADDONS_SECRET && !!r.value);
}

/** Owner: start sharing this device's add-ons with the family, or stop ("" deletes it). */
export async function setFamilyAddonsShared(on: boolean): Promise<void> {
  const snapshot = on ? ownSnapshot() : "";
  if (on && !snapshot) throw new Error("Install an add-on before sharing your add-ons.");
  await jlRpc("set_secret", { p_name: FAMILY_ADDONS_SECRET, p_value: snapshot ?? "" });
}

/**
 * One pass of the account sync. The owner's shared list follows their add-ons while sharing is
 * on; a member's device installs and removes the family's add-ons.
 */
export async function syncFamilyAddons(scope: {
  account: JlAccountContext;
  assertCurrent: () => void;
}): Promise<void> {
  const profile = addonStorageProfileId();
  const [own, family] = await Promise.all([
    jlRpc<unknown>("get_secrets", {}, scope.account).then(rows),
    jlRpc<unknown>("get_family_secrets", {}, scope.account).then(rows),
  ]);
  scope.assertCurrent();

  // Owner (sharing on): keep the shared copy in step with the add-ons on this device.
  const sharing = own.find((r) => r.name === FAMILY_ADDONS_SECRET)?.value;
  if (sharing) {
    const snapshot = ownSnapshot();
    const current = decodeShared(sharing)
      .map((a) => a.transportUrl)
      .join("\n");
    const next = snapshot
      ? decodeShared(snapshot)
          .map((a) => a.transportUrl)
          .join("\n")
      : "";
    if (snapshot && current !== next) {
      await jlRpc("set_secret", { p_name: FAMILY_ADDONS_SECRET, p_value: snapshot }, scope.account);
      scope.assertCurrent();
    }
  }

  // Member: the family's add-ons on this device.
  const shared = decodeShared(family.find((r) => r.name === FAMILY_ADDONS_SECRET)?.value);
  const plan = planFamilyAddons(
    loadInstalled().map((a) => a.transportUrl),
    shared,
    readAdded(),
  );
  if (!plan.install.length && !plan.remove.length) {
    writeAdded(plan.added);
    return;
  }
  const failed = new Set<string>();
  for (const addon of plan.install) {
    if (addonStorageProfileId() !== profile) return;
    await installAddon(addon.id, addon.transportUrl).catch(() => {
      failed.add(addon.transportUrl);
    });
  }
  for (const url of plan.remove) {
    if (addonStorageProfileId() !== profile) return;
    const found = loadInstalled().find((a) => a.transportUrl === url);
    if (found) await uninstallAddon(found.id, url);
  }
  writeAdded(plan.added.filter((url) => !failed.has(url)));
  window.dispatchEvent(new CustomEvent("harbor:addons-changed"));
}
