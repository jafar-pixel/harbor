import type { PortableAddon } from "./addon-backup";

export type FamilyAddonsPlan = {
  install: PortableAddon[];
  remove: string[];
  added: string[];
};

/**
 * What to change on a member's device: install shared add-ons it lacks, remove the ones it added
 * from the family that are no longer shared, and never touch the member's own add-ons.
 */
export function planFamilyAddons(
  installedUrls: readonly string[],
  shared: readonly PortableAddon[],
  addedBefore: readonly string[],
): FamilyAddonsPlan {
  const installed = new Set(installedUrls);
  const sharedUrls = new Set(shared.map((a) => a.transportUrl));
  const install = shared.filter((a) => !installed.has(a.transportUrl));
  const remove = addedBefore.filter((url) => !sharedUrls.has(url) && installed.has(url));
  const added = [
    ...addedBefore.filter((url) => sharedUrls.has(url)),
    ...install.map((a) => a.transportUrl),
  ];
  return { install, remove, added: [...new Set(added)] };
}
