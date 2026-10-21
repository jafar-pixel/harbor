import { loadInstalled, saveInstalled, addonStorageProfileId } from "@/lib/addon-store";
import { jlRpc, type JlAccountContext } from "./client";
import { decodeAddonBackup, type PortableAddon } from "./addon-backup";
import { decodeJournal, reconcileAddons, type AddonOp } from "./addon-sync";
const writer = crypto.randomUUID();
const checkpoints = new Map<string, { base: PortableAddon[]; ops: AddonOp[] }>();
export async function syncJlAddons(scope: {
  account: JlAccountContext;
  localId: string;
  profileId: string;
  assertCurrent: () => void;
}) {
  const assert = () => {
    scope.assertCurrent();
    if (addonStorageProfileId() !== scope.localId)
      throw new Error("Select the addon owner profile");
  };
  scope.assertCurrent();
  if (addonStorageProfileId() !== scope.localId) return;
  assert();
  const prefix = "addon-sync:v1:" + scope.profileId + ":";
  const key =
    "jl.addon-sync.v1." + scope.account.userId + "." + scope.localId + "." + scope.profileId;
  const rows = await jlRpc<unknown>("get_secrets", {}, scope.account);
  assert();
  if (!Array.isArray(rows)) throw new Error("Invalid addon sync response");
  const remote: AddonOp[] = [];
  for (const row of rows) {
    if (typeof row?.name !== "string") continue;
    if (row.name.startsWith(prefix)) {
      if (typeof row.value !== "string") throw new Error("Invalid addon sync response");
      remote.push(...decodeJournal(row.value, scope.profileId).ops);
    } else if (row.name === "addon-backup:v1:" + scope.profileId) {
      for (const addon of decodeAddonBackup(row.value, scope.profileId))
        remote.push({ addon, removed: false, clock: 0, writer: "backup" });
    }
  }
  const checkpoint = checkpoints.get(key);
  const raw = localStorage.getItem(key);
  const stored = raw === null ? null : decodeAddonBackup(raw, scope.profileId);
  const local = loadInstalled();
  const { journal, desired } = reconcileAddons(
    scope.profileId,
    writer,
    local,
    checkpoint?.base ?? stored,
    checkpoint?.ops ?? [],
    remote,
  );
  assert();
  if (journal.ops.length && JSON.stringify(journal.ops) !== JSON.stringify(checkpoint?.ops)) {
    await jlRpc(
      "set_secret",
      { p_name: prefix + writer, p_value: JSON.stringify(journal) },
      scope.account,
    );
    assert();
    if (JSON.stringify(loadInstalled()) !== JSON.stringify(local)) return;
  }
  assert();
  const keep = JSON.stringify({
    version: 1,
    profileId: scope.profileId,
    addons: desired.map(({ id, transportUrl, installedAt }) => ({ id, transportUrl, installedAt })),
  });
  decodeAddonBackup(keep, scope.profileId);
  if (JSON.stringify(local) !== JSON.stringify(desired)) {
    saveInstalled(desired);
    window.dispatchEvent(new CustomEvent("harbor:addons-changed"));
  }
  localStorage.setItem(key, keep);
  checkpoints.set(key, { base: desired, ops: journal.ops });
}
