-- Playoff bracket pools (Sports -> Brackets). A pool is one tournament's bracket game: its owner
-- sets the field (which team holds each seed) and when picks lock; members join with the pool's
-- code and keep one entry each. A personal bracket is a pool with one member.
--
-- Access, all enforced here rather than in the app:
--   * a pool and its entries are visible only to its members (the owner is a member);
--   * only the owner changes a pool or removes another member's entry;
--   * a member changes only their own entry, and only before the pool locks;
--   * joining goes through join_bracket_pool(code), never a direct insert.
-- Scores aren't stored: every member computes the same leaderboard from the entries and the
-- public results.

create table if not exists media.bracket_pools (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('cfp', 'nfl', 'nba', 'mlb', 'ncaam', 'ncaaw')),
  season int not null check (season between 2020 and 2100),
  name text not null check (char_length(name) between 1 and 80),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  join_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
    check (join_code ~ '^[A-Z0-9]{8}$'),
  -- entrant key ("AFC:1", "East:16a") -> { teamId, league, name, abbr, logo }
  field jsonb not null default '{}'::jsonb check (jsonb_typeof(field) = 'object'),
  -- March Madness regions and First Four for the year; empty for the other formats.
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  locks_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists media.bracket_entries (
  pool_id uuid not null references media.bracket_pools (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  -- matchup id -> picked entrant key
  picks jsonb not null default '{}'::jsonb check (jsonb_typeof(picks) = 'object'),
  tiebreaker int check (tiebreaker between 0 and 500),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

create index if not exists bracket_entries_user_idx on media.bracket_entries (user_id);
create index if not exists bracket_pools_owner_idx on media.bracket_pools (owner);

-- Membership check outside RLS, so entry policies don't recurse into themselves.
create or replace function media.is_bracket_member(p_pool uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from media.bracket_entries e
    where e.pool_id = p_pool and e.user_id = auth.uid()
  ) or exists (
    select 1 from media.bracket_pools p
    where p.id = p_pool and p.owner = auth.uid()
  );
$$;

create or replace function media.bracket_pool_open(p_pool uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from media.bracket_pools p
    where p.id = p_pool and (p.locks_at is null or now() < p.locks_at)
  );
$$;

alter table media.bracket_pools enable row level security;
alter table media.bracket_entries enable row level security;

drop policy if exists bracket_pools_read on media.bracket_pools;
create policy bracket_pools_read on media.bracket_pools
  for select to authenticated using (media.is_bracket_member(id));

drop policy if exists bracket_pools_create on media.bracket_pools;
create policy bracket_pools_create on media.bracket_pools
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists bracket_pools_owner_update on media.bracket_pools;
create policy bracket_pools_owner_update on media.bracket_pools
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists bracket_pools_owner_delete on media.bracket_pools;
create policy bracket_pools_owner_delete on media.bracket_pools
  for delete to authenticated using (owner = auth.uid());

drop policy if exists bracket_entries_read on media.bracket_entries;
create policy bracket_entries_read on media.bracket_entries
  for select to authenticated using (media.is_bracket_member(pool_id));

-- The owner's own entry is created directly; everyone else joins through join_bracket_pool.
drop policy if exists bracket_entries_owner_create on media.bracket_entries;
create policy bracket_entries_owner_create on media.bracket_entries
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from media.bracket_pools p where p.id = pool_id and p.owner = auth.uid())
  );

drop policy if exists bracket_entries_own_update on media.bracket_entries;
create policy bracket_entries_own_update on media.bracket_entries
  for update to authenticated
  using (user_id = auth.uid() and media.bracket_pool_open(pool_id))
  with check (user_id = auth.uid() and media.bracket_pool_open(pool_id));

drop policy if exists bracket_entries_leave_or_remove on media.bracket_entries;
create policy bracket_entries_leave_or_remove on media.bracket_entries
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from media.bracket_pools p where p.id = pool_id and p.owner = auth.uid())
  );

-- Join a pool by its code (case-insensitive). Re-joining keeps the existing entry.
create or replace function media.join_bracket_pool(p_code text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pool uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in to join a pool' using errcode = '42501';
  end if;
  select id into v_pool from media.bracket_pools where join_code = upper(trim(p_code));
  if v_pool is null then
    raise exception 'no pool with that code' using errcode = 'P0002';
  end if;
  insert into media.bracket_entries (pool_id, user_id, display_name)
  values (v_pool, auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'Player'), 40))
  on conflict (pool_id, user_id) do nothing;
  return v_pool;
end;
$$;

revoke all on function media.join_bracket_pool(text, text) from public;
grant execute on function media.join_bracket_pool(text, text) to authenticated;
revoke all on function media.is_bracket_member(uuid) from public;
grant execute on function media.is_bracket_member(uuid) to authenticated;
revoke all on function media.bracket_pool_open(uuid) from public;
grant execute on function media.bracket_pool_open(uuid) to authenticated;

-- Schema defaults may grant everything on new tables; start from nothing.
revoke all on media.bracket_pools from anon, authenticated;
revoke all on media.bracket_entries from anon, authenticated;
grant select, insert, delete on media.bracket_pools to authenticated;
grant select, insert, delete on media.bracket_entries to authenticated;
-- Column grants: an entry can't be moved to another pool or user (that would skip the join
-- code), and a pool keeps its id, owner and code.
grant update (name, field, options, locks_at, updated_at) on media.bracket_pools to authenticated;
grant update (display_name, picks, tiebreaker, updated_at) on media.bracket_entries to authenticated;
