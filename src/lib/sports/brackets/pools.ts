import { jlAccountContext, jlRest, jlRpc } from "@/lib/jl/account/client";
import type { EntrantKey, MarchMadnessOptions, TournamentKind, Winners } from "./engine";

/**
 * Bracket pools on the viewer's JL account (supabase/jl-vision/0004_bracket_pools.sql). The
 * database decides who sees and changes what: pools and entries are members-only, a member edits
 * only their own picks and only before the pool locks, and joining goes through the code. A
 * personal bracket is a pool with one member.
 */

/** The team holding a seed in a pool's field. */
export type FieldTeam = {
  teamId: string;
  league: string;
  name: string;
  abbr: string;
  logo: string;
};

export type BracketPool = {
  id: string;
  kind: TournamentKind;
  season: number;
  name: string;
  owner: string;
  join_code: string;
  field: Record<EntrantKey, FieldTeam>;
  options: Partial<MarchMadnessOptions>;
  locks_at: string | null;
  created_at: string;
};

export type BracketEntry = {
  pool_id: string;
  user_id: string;
  display_name: string;
  picks: Winners;
  tiebreaker: number | null;
  updated_at: string;
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // PostgREST error bodies carry the database message ("no pool with that code").
    const message = (() => {
      try {
        return (JSON.parse(body) as { message?: string }).message;
      } catch {
        return null;
      }
    })();
    throw new Error(message || `Bracket request failed (${res.status})`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const RETURN = { Prefer: "return=representation" };

/** The signed-in account, or an error that says so. */
function me(): string {
  const ctx = jlAccountContext();
  if (!ctx) throw new Error("Sign in to your JL Media Vision account to use bracket pools.");
  return ctx.userId;
}

export function isPoolOpen(pool: Pick<BracketPool, "locks_at">, now = Date.now()): boolean {
  return !pool.locks_at || now < Date.parse(pool.locks_at);
}

export async function listPools(): Promise<BracketPool[]> {
  me();
  return json(await jlRest("bracket_pools?select=*&order=created_at.desc"));
}

export async function getPool(id: string): Promise<BracketPool | null> {
  me();
  const rows = await json<BracketPool[]>(
    await jlRest(`bracket_pools?select=*&id=eq.${encodeURIComponent(id)}`),
  );
  return rows[0] ?? null;
}

/** A new pool with the owner's own entry in it. */
export async function createPool(input: {
  kind: TournamentKind;
  season: number;
  name: string;
  displayName: string;
  locksAt?: string | null;
  options?: Partial<MarchMadnessOptions>;
}): Promise<BracketPool> {
  me();
  const [pool] = await json<BracketPool[]>(
    await jlRest("bracket_pools", {
      method: "POST",
      headers: RETURN,
      body: JSON.stringify({
        kind: input.kind,
        season: input.season,
        name: input.name.trim().slice(0, 80),
        locks_at: input.locksAt ?? null,
        options: input.options ?? {},
      }),
    }),
  );
  await json(
    await jlRest("bracket_entries", {
      method: "POST",
      body: JSON.stringify({ pool_id: pool.id, display_name: input.displayName.slice(0, 40) }),
    }),
  );
  return pool;
}

/** Join by code; returns the pool id. Joining a pool you're already in keeps your entry. */
export async function joinPool(code: string, displayName: string): Promise<string> {
  me();
  return jlRpc<string>("join_bracket_pool", {
    p_code: code.trim().toUpperCase(),
    p_name: displayName.slice(0, 40),
  });
}

export async function listEntries(poolId: string): Promise<BracketEntry[]> {
  me();
  return json(
    await jlRest(
      `bracket_entries?select=pool_id,user_id,display_name,picks,tiebreaker,updated_at&pool_id=eq.${encodeURIComponent(poolId)}&order=joined_at.asc`,
    ),
  );
}

/** Save the viewer's picks. The database refuses once the pool has locked. */
export async function savePicks(
  poolId: string,
  picks: Winners,
  tiebreaker: number | null,
): Promise<void> {
  const user = me();
  const rows = await json<BracketEntry[]>(
    await jlRest(
      `bracket_entries?pool_id=eq.${encodeURIComponent(poolId)}&user_id=eq.${encodeURIComponent(user)}`,
      {
        method: "PATCH",
        headers: RETURN,
        body: JSON.stringify({ picks, tiebreaker, updated_at: new Date().toISOString() }),
      },
    ),
  );
  if (!rows.length) throw new Error("Picks are locked for this pool.");
}

/** Owner only: the field, lock time, name or March Madness setup. */
export async function updatePool(
  poolId: string,
  patch: Partial<Pick<BracketPool, "name" | "field" | "options" | "locks_at">>,
): Promise<void> {
  me();
  const rows = await json<BracketPool[]>(
    await jlRest(`bracket_pools?id=eq.${encodeURIComponent(poolId)}`, {
      method: "PATCH",
      headers: RETURN,
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    }),
  );
  if (!rows.length) throw new Error("Only the pool's owner can change it.");
}

/** Leave a pool (a member) or delete it (its owner). */
export async function leaveOrDeletePool(pool: Pick<BracketPool, "id" | "owner">): Promise<void> {
  const user = me();
  const path =
    pool.owner === user
      ? `bracket_pools?id=eq.${encodeURIComponent(pool.id)}`
      : `bracket_entries?pool_id=eq.${encodeURIComponent(pool.id)}&user_id=eq.${encodeURIComponent(user)}`;
  await json(await jlRest(path, { method: "DELETE" }));
}
