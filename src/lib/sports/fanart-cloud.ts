/**
 * JL Vision Supabase fanart source adapter.
 * A signed-in JL Vision session must be provided by the host account bridge.
 * Never pass a service-role key to client code.
 */
export type FanartSlot = "hero" | "wallpaper" | "card" | "story" | "wordmark";
export type FanartRights = "reference" | "permission_pending" | "licensed" | "owned";
export interface FanartSource {
  id: string;
  sourceUrl: string;
  title: string;
  creator: string;
  team: string;
  kind: FanartSlot;
  rights: FanartRights;
  addedAt: string;
}
export interface FanartCloudSession {
  /** Public publishable/anon key, NEVER the service-role key. */
  publishableKey: string;
  /** Supabase Auth JWT for this project. */
  accessToken: string;
  /** Supabase Auth user.id for the same session. */
  userId: string;
}
const PROJECT_URL = "https://ajbjyjfiglzodbdcdapr.supabase.co";
const RESOURCE = "/rest/v1/sports_fanart_sources";
type RemoteRow = {
  id: string; user_id: string; source_url: string; title: string; creator: string;
  team: string; slot: FanartSlot; rights_status: FanartRights; created_at: string;
};
function authHeaders(session: FanartCloudSession): Record<string, string> {
  if (!session.publishableKey || !session.accessToken || !session.userId) {
    throw new Error("A signed-in JL Vision Supabase session is required.");
  }
  return { apikey: session.publishableKey, Authorization: `Bearer ${session.accessToken}` };
}
async function checked(response: Response): Promise<Response> {
  if (!response.ok) {
    throw new Error(`Fanart sync failed (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  return response;
}
const fromRow = (row: RemoteRow): FanartSource => ({
  id: row.id, sourceUrl: row.source_url, title: row.title, creator: row.creator,
  team: row.team, kind: row.slot, rights: row.rights_status, addedAt: row.created_at,
});
/** Fetch records owned by the active Supabase user; RLS enforces ownership. */
export async function loadCloudFanartSources(session: FanartCloudSession): Promise<FanartSource[]> {
  const qs = new URLSearchParams({ select: "id,user_id,source_url,title,creator,team,slot,rights_status,created_at", user_id: `eq.${session.userId}`, order: "created_at.desc", limit: "1000" });
  const res = await checked(await fetch(`${PROJECT_URL}${RESOURCE}?${qs}`, { headers: authHeaders(session) }));
  return ((await res.json()) as RemoteRow[]).map(fromRow);
}
/** Upsert only the signed-in user's records. The DB unique key is (user_id,source_url). */
export async function saveCloudFanartSources(session: FanartCloudSession, items: FanartSource[]): Promise<FanartSource[]> {
  const rows = items.map((item) => ({
    user_id: session.userId,
    source_url: item.sourceUrl,
    title: item.title,
    creator: item.creator,
    team: item.team,
    slot: item.kind,
    rights_status: item.rights,
  }));
  if (!rows.length) return [];
  const res = await checked(await fetch(`${PROJECT_URL}${RESOURCE}?on_conflict=user_id,source_url`, {
    method: "POST",
    headers: { ...authHeaders(session), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  }));
  return ((await res.json()) as RemoteRow[]).map(fromRow);
}
export async function deleteCloudFanartSource(session: FanartCloudSession, sourceUrl: string): Promise<void> {
  const qs = new URLSearchParams({ user_id: `eq.${session.userId}`, source_url: `eq.${sourceUrl}` });
  await checked(await fetch(`${PROJECT_URL}${RESOURCE}?${qs}`, { method: "DELETE", headers: authHeaders(session) }));
}
/** Never publish records based only on their status: confirm licensing evidence and approval separately. */
export function isPotentiallyPublishable(item: FanartSource): boolean {
  return item.rights === "licensed" || item.rights === "owned";
}
