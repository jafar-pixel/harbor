/**
 * Live TV favorites kept with the linked JL profile, so the channels hearted on one device show
 * under Favorites on the others (the TV app included). Stored as one account value per profile;
 * the merge works like the catalog favorites: additions and removals since this device's last
 * sync win, everything else follows the account. The sync itself is iptv-favorites-sync.ts.
 */
/** The local store (src/lib/iptv/favorites.tsx). */
export const IPTV_FAVORITES_KEY = "harbor.iptv.favorites.v2";
/** Fired after a sync changed the local store; the favorites provider reloads it. */
export const IPTV_FAVORITES_REMOTE_EVENT = "harbor:iptv-favorites-remote";
/** Fired when the viewer changes a favorite; the account sync runs. */
export const IPTV_FAVORITES_LOCAL_EVENT = "jl:iptv-favorites-changed";

export type IptvFavorite = { id: string } & Record<string, unknown>;

export function parseIptvFavorites(raw: string | null | undefined): IptvFavorite[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value)
      ? value.filter(
          (e): e is IptvFavorite => !!e && typeof e === "object" && typeof e.id === "string",
        )
      : [];
  } catch {
    return [];
  }
}

/** Remote membership plus this device's additions and removals since `base`. */
export function mergeIptvFavorites(
  base: string[] | null,
  local: IptvFavorite[],
  remote: IptvFavorite[],
): IptvFavorite[] {
  const result = new Map(remote.map((f) => [f.id, f]));
  const previous = new Set(base ?? []);
  const current = new Set(local.map((f) => f.id));
  for (const f of local) if (!previous.has(f.id)) result.set(f.id, f);
  if (base) for (const id of previous) if (!current.has(id)) result.delete(id);
  return [...result.values()];
}
