import { decodeAddonBackup, type PortableAddon } from "./addon-backup";
export type AddonOp = { addon: PortableAddon; removed: boolean; clock: number; writer: string };
export type AddonJournal = { version: 1; profileId: string; ops: AddonOp[] };
export function decodeJournal(text: string, profileId: string): AddonJournal {
  if (text.length > 512000) throw new Error("Invalid addon sync data");
  const v = JSON.parse(text) as AddonJournal;
  if (v?.version !== 1 || v.profileId !== profileId || !Array.isArray(v.ops) || v.ops.length > 1000)
    throw new Error("Invalid addon sync data");
  const ops = v.ops.map((op) => {
    if (
      !op ||
      typeof op.removed !== "boolean" ||
      !Number.isSafeInteger(op.clock) ||
      op.clock < 0 ||
      typeof op.writer !== "string" ||
      op.writer.length > 100
    )
      throw new Error("Invalid addon sync data");
    const [addon] = decodeAddonBackup(
      JSON.stringify({ version: 1, profileId, addons: [op.addon] }),
      profileId,
    );
    return { addon, removed: op.removed, clock: op.clock, writer: op.writer };
  });
  return { version: 1, profileId, ops };
}
export function mergeAddonOps(ops: AddonOp[]): AddonOp[] {
  const winners = new Map<string, AddonOp>();
  for (const op of ops) {
    const prev = winners.get(op.addon.transportUrl);
    if (!prev || op.clock > prev.clock || (op.clock === prev.clock && op.writer > prev.writer))
      winners.set(op.addon.transportUrl, op);
  }
  return [...winners.values()];
}
export function reconcileAddons(
  profileId: string,
  writer: string,
  local: PortableAddon[],
  base: PortableAddon[] | null,
  own: AddonOp[],
  remote: AddonOp[],
) {
  const all = mergeAddonOps([...remote, ...own]);
  const clock = Math.max(0, ...all.map((op) => op.clock)) + 1;
  const before = new Map((base ?? []).map((a) => [a.transportUrl, a]));
  const current = new Map(local.map((a) => [a.transportUrl, a]));
  const edits: AddonOp[] = [];
  for (const addon of local)
    if (!before.has(addon.transportUrl))
      edits.push({ addon, removed: false, clock: base === null ? 0 : clock, writer });
  if (base !== null)
    for (const addon of base)
      if (!current.has(addon.transportUrl)) edits.push({ addon, removed: true, clock, writer });
  const ops = mergeAddonOps([...own, ...edits]);
  const desired = mergeAddonOps([...remote, ...ops])
    .filter((op) => !op.removed)
    .map((op) => current.get(op.addon.transportUrl) ?? op.addon);
  if (desired.length > 200) throw new Error("Too many synced addons");
  const journal: AddonJournal = { version: 1, profileId, ops };
  decodeJournal(JSON.stringify(journal), profileId);
  return { journal, desired };
}
