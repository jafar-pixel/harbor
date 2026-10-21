/** Explicit account backups. Configured URLs belong only in the encrypted secrets RPC. */
export type PortableAddon = { id: string; transportUrl: string; installedAt: number };
type Snapshot = { version: 1; profileId: string; addons: PortableAddon[] };
const MAX_BYTES = 256_000;
const MAX_ADDONS = 200;
const invalid = () =>
  new Error("The saved addon backup is invalid. Your installed addons were kept.");

function addonsFrom(value: unknown): PortableAddon[] {
  if (!Array.isArray(value) || value.length > MAX_ADDONS) throw invalid();
  const urls = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw invalid();
    const v = item as Record<string, unknown>;
    if (
      typeof v.id !== "string" ||
      !v.id ||
      v.id.length > 512 ||
      typeof v.transportUrl !== "string" ||
      v.transportUrl.length > 16_384 ||
      typeof v.installedAt !== "number" ||
      !Number.isFinite(v.installedAt) ||
      v.installedAt < 0
    )
      throw invalid();
    let url: URL;
    try {
      url = new URL(v.transportUrl);
    } catch {
      throw invalid();
    }
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !/\/manifest\.json$/i.test(url.pathname) ||
      url.hash ||
      urls.has(v.transportUrl)
    )
      throw invalid();
    urls.add(v.transportUrl);
    // Do not copy arbitrary manifest metadata, artwork, headers or local file paths.
    return { id: v.id, transportUrl: v.transportUrl, installedAt: v.installedAt };
  });
}

export function encodeAddonBackup(profileId: string, addons: unknown): string {
  const snapshot: Snapshot = { version: 1, profileId, addons: addonsFrom(addons) };
  if (!snapshot.addons.length) throw new Error("Install an addon before saving a backup.");
  const text = JSON.stringify(snapshot);
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw invalid();
  return text;
}

export function decodeAddonBackup(text: string, profileId: string): PortableAddon[] {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw invalid();
  let value: Snapshot;
  try {
    value = JSON.parse(text) as Snapshot;
  } catch {
    throw invalid();
  }
  if (!value || value.version !== 1 || value.profileId !== profileId) throw invalid();
  return addonsFrom(value.addons);
}

export type AddonBackupPorts = {
  profileId: string;
  assertCurrent: () => void;
  readLocal: () => PortableAddon[];
  writeLocal: (addons: PortableAddon[]) => void;
  pull: () => Promise<string | null>;
  push: (value: string) => Promise<void>;
};

/** An explicit save replaces this profile's previous backup; it is not automatic sync. */
export async function saveAddonBackup(ports: AddonBackupPorts): Promise<number> {
  ports.assertCurrent();
  const text = encodeAddonBackup(ports.profileId, ports.readLocal());
  ports.assertCurrent();
  await ports.push(text);
  ports.assertCurrent();
  return decodeAddonBackup(text, ports.profileId).length;
}

/** Read local state after the network wait, preserving installations added during restore. */
export async function restoreAddonBackup(ports: AddonBackupPorts): Promise<number> {
  ports.assertCurrent();
  const text = await ports.pull();
  ports.assertCurrent();
  if (text === null) throw new Error("No addon backup was found for this JL profile.");
  const saved = decodeAddonBackup(text, ports.profileId);
  const current = ports.readLocal();
  const urls = new Set(current.map((addon) => addon.transportUrl));
  const added = saved.filter((addon) => !urls.has(addon.transportUrl));
  ports.assertCurrent();
  if (added.length) ports.writeLocal([...current, ...added]);
  return added.length;
}
