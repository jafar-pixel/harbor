import { loadInstalled, saveInstalled, addonStorageProfileId } from "@/lib/addon-store";
import { assertJlAccountCurrent, jlRpc } from "./client";
import { jlProfileContext, refreshJlProfileContext } from "./sync";
import { createJlLinkStore } from "./profile-links";
import { saveAddonBackup, restoreAddonBackup, type AddonBackupPorts } from "./addon-backup";

function backupPorts(): AddonBackupPorts {
  const context = jlProfileContext();
  const links = createJlLinkStore(localStorage);
  const link = links.link(context.localId, context.account.userId);
  if (!link) throw new Error("Link this device to a JL profile before transferring addons.");
  if (addonStorageProfileId() !== context.localId)
    throw new Error("Select the profile that owns these shared addons before transferring them.");
  const assertCurrent = () => {
    assertJlAccountCurrent(context.account);
    const current = refreshJlProfileContext(context);
    const currentLink = links.link(current.localId, current.account.userId);
    if (
      current.revision !== context.revision ||
      currentLink?.profileId !== link.profileId ||
      addonStorageProfileId() !== context.localId
    )
      throw new Error("JL profile changed. Try again.");
  };
  const name = `addon-backup:v1:${link.profileId}`;
  return {
    profileId: link.profileId,
    assertCurrent,
    readLocal: loadInstalled,
    writeLocal: (addons) => {
      assertCurrent();
      saveInstalled(addons);
      window.dispatchEvent(new CustomEvent("harbor:addons-changed"));
    },
    pull: async () => {
      const rows = await jlRpc<unknown>("get_secrets", {}, context.account);
      assertCurrent();
      if (!Array.isArray(rows))
        throw new Error("The JL account service returned an invalid backup.");
      const matches = rows.filter((row) => row && typeof row === "object" && row.name === name);
      if (!matches.length) return null;
      if (matches.length !== 1 || typeof matches[0].value !== "string")
        throw new Error("The JL account service returned an invalid backup.");
      return matches[0].value;
    },
    push: (value) => jlRpc("set_secret", { p_name: name, p_value: value }, context.account),
  };
}

export const saveJlAddonBackup = () => saveAddonBackup(backupPorts());
export const restoreJlAddonBackup = () => restoreAddonBackup(backupPorts());
