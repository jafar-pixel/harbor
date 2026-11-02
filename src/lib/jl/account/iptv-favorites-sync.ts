import { jlRpc, type JlAccountContext } from "./client";
import {
  IPTV_FAVORITES_KEY,
  IPTV_FAVORITES_REMOTE_EVENT,
  mergeIptvFavorites,
  parseIptvFavorites as parse,
  type IptvFavorite,
} from "./iptv-favorites";

export { IPTV_FAVORITES_LOCAL_EVENT } from "./iptv-favorites";

const sameIds = (a: IptvFavorite[], b: IptvFavorite[]) => {
  const ids = new Set(a.map((f) => f.id));
  return ids.size === b.length && b.every((f) => ids.has(f.id));
};

export async function syncJlIptvFavorites(scope: {
  account: JlAccountContext;
  localId: string;
  profileId: string;
  assertCurrent: () => void;
}): Promise<void> {
  const name = `iptv-favorites:v1:${scope.profileId}`;
  const baseKey = `jl.account.iptv-favorites.base.v1.${scope.account.userId}.${scope.localId}.${scope.profileId}`;

  scope.assertCurrent();
  const rows = await jlRpc<Array<{ name: string; value: string }>>(
    "get_secrets",
    {},
    scope.account,
  );
  scope.assertCurrent();
  if (!Array.isArray(rows)) throw new Error("Invalid JL favorites response");
  const remote = parse(rows.find((r) => r?.name === name)?.value);

  let base: string[] | null = null;
  try {
    const raw = localStorage.getItem(baseKey);
    if (raw)
      base = (JSON.parse(raw) as unknown[]).filter((id): id is string => typeof id === "string");
  } catch {
    base = null;
  }
  const local = parse(localStorage.getItem(IPTV_FAVORITES_KEY));
  const desired = mergeIptvFavorites(base, local, remote);

  if (!sameIds(local, desired)) {
    localStorage.setItem(IPTV_FAVORITES_KEY, JSON.stringify(desired));
    window.dispatchEvent(new Event(IPTV_FAVORITES_REMOTE_EVENT));
  }
  if (!sameIds(remote, desired)) {
    await jlRpc("set_secret", { p_name: name, p_value: JSON.stringify(desired) }, scope.account);
    scope.assertCurrent();
  }
  localStorage.setItem(baseKey, JSON.stringify(desired.map((f) => f.id)));
}
