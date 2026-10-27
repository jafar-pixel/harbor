import { useCallback, useEffect, useState } from "react";
import { jlFunction, jlRpc, useJlSession } from "./client";

/**
 * A JL family: the owner shares their service keys (Real-Debrid, TorBox, IPTV logins) with
 * members who sign in with their own accounts. No member or stream limit in the app; each
 * service manages its own connections.
 */

export type FamilyMember = { userId: string; name: string; joinedAt: string };
export type FamilyInvite = { code: string; expiresAt: string };
export type Family = {
  id: string;
  name: string;
  role: "owner" | "member";
  members: FamilyMember[];
  invites: FamilyInvite[];
};

export const myFamily = () => jlRpc<Family | null>("my_family");
export const createFamily = (name: string) => jlRpc<string>("create_family", { p_name: name });
export const createFamilyInvite = () => jlRpc<string>("create_family_invite");
export const cancelFamilyInvite = (code: string) =>
  jlRpc<void>("cancel_family_invite", { p_code: code });
export const joinFamily = (code: string, name: string) =>
  jlRpc<string>("join_family", { p_code: code, p_name: name });
export const leaveFamily = () => jlRpc<void>("leave_family");
export const removeFamilyMember = (userId: string) =>
  jlRpc<void>("remove_family_member", { p_user: userId });
export const deleteFamily = () => jlRpc<void>("delete_family");

/** Invite codes are 8 letters and digits; spaces and dashes people type are ignored. */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The signed-in account's family, with a reload after each change. */
export function useFamily(): {
  family: Family | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
} {
  const session = useJlSession();
  const userId = session?.userId ?? "";
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!userId) {
      setFamily(null);
      return;
    }
    let live = true;
    setLoading(true);
    setError(false);
    myFamily()
      .then((f) => live && setFamily(f))
      .catch(() => live && setError(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [userId, version]);
  return { family, loading, error, reload };
}

export type EmailInviteResult = {
  status: "emailed" | "link" | "added" | "already";
  userId: string;
  link: string | null;
};

/** Invite by email: new people get an account and an invite email; existing accounts join now. */
export async function inviteFamilyByEmail(email: string, name: string): Promise<EmailInviteResult> {
  const res = await jlFunction("family-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<EmailInviteResult> & {
    error?: string;
  };
  if (!res.ok || !body.status) throw new Error(body.error || "The invite couldn't be sent.");
  return body as EmailInviteResult;
}

/** Providers the owner can set up for a member: their own key wins over the family's. */
export const MEMBER_PROVIDERS = [
  { key: "rdKey", label: "Real-Debrid API key" },
  { key: "tbKey", label: "TorBox API key" },
  { key: "adKey", label: "AllDebrid API key" },
  { key: "pmKey", label: "Premiumize API key" },
] as const;

export const memberProviderNames = (userId: string) =>
  jlRpc<string[]>("member_secret_names", { p_user: userId }).then((rows) =>
    (rows ?? []).map((name) => name.replace(/^setting:/, "")),
  );

export const setMemberProvider = (userId: string, key: string, value: string) =>
  jlRpc<void>("set_member_secret", { p_user: userId, p_name: `setting:${key}`, p_value: value });
