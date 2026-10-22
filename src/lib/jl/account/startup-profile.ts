type Profile = { id: string; passwordHash?: string | null };
/** Reopen this account's last linked identity, without crossing a workspace or PIN boundary. */
export function accountStartupProfile(
  profiles: Profile[],
  activeId: string | null,
  storage: Pick<Storage, "getItem">,
): string | null {
  try {
    const session = JSON.parse(storage.getItem("jl.account.session.v1") ?? "null");
    if (!session?.userId || storage.getItem("jl.account.workspace.owner.v1") !== session.userId)
      return null;
    const linked = profiles.filter((profile) => {
      if (profile.passwordHash) return false;
      const link = JSON.parse(storage.getItem("jl.account.link.v2." + profile.id) ?? "null");
      return link?.accountId === session.userId && link?.status === "linked" && !!link.profileId;
    });
    if (linked.some((profile) => profile.id === activeId)) return activeId;
    return linked.length === 1 ? linked[0].id : null;
  } catch {
    return null;
  }
}
