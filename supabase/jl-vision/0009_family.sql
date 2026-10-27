-- Family: one account owner shares their service keys (Real-Debrid, TorBox, IPTV logins and the
-- rest of the synced settings) with family members who sign in with their own JL accounts. The
-- app puts no limit on members or streams; each service enforces its own.

create table if not exists media.families (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null unique references auth.users (id) on delete cascade,
  name text not null default 'Family' check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table if not exists media.family_members (
  family_id uuid not null references media.families (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table if not exists media.family_invites (
  code text primary key,
  family_id uuid not null references media.families (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);
create index if not exists family_invites_family_idx on media.family_invites (family_id);

-- Reached only through the functions below.
alter table media.families enable row level security;
alter table media.family_members enable row level security;
alter table media.family_invites enable row level security;
revoke all on media.families, media.family_members, media.family_invites from anon, authenticated;
grant all on media.families, media.family_members, media.family_invites to service_role;

/** The caller's family: as its owner or as a member, with members and open invites. */
create or replace function media.my_family() returns jsonb
language sql stable security definer set search_path = '' as $$
  with f as (
    select fam.*, case when fam.owner = (select auth.uid()) then 'owner' else 'member' end as role
    from media.families fam
    where fam.owner = (select auth.uid())
       or fam.id = (select m.family_id from media.family_members m where m.user_id = (select auth.uid()))
  )
  select case when f.id is null then null else jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'role', f.role,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('userId', m.user_id, 'name', m.name, 'joinedAt', m.joined_at)
                       order by m.joined_at)
      from media.family_members m where m.family_id = f.id), '[]'::jsonb),
    'invites', case when f.role = 'owner' then coalesce((
      select jsonb_agg(jsonb_build_object('code', i.code, 'expiresAt', i.expires_at) order by i.created_at)
      from media.family_invites i
      where i.family_id = f.id and i.used_by is null and i.expires_at > now()), '[]'::jsonb)
      else '[]'::jsonb end
  ) end
  from (select 1) one left join f on true;
$$;

create or replace function media.create_family(p_name text default 'Family') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from media.family_members where user_id = uid) then
    raise exception 'already in a family';
  end if;
  insert into media.families (owner, name) values (uid, coalesce(nullif(trim(p_name), ''), 'Family'))
  on conflict (owner) do update set name = excluded.name
  returning id into fid;
  return fid;
end $$;

create or replace function media.create_family_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  fid uuid := (select id from media.families where owner = auth.uid());
  c text;
begin
  if fid is null then raise exception 'no family'; end if;
  -- 8 characters with no look-alikes (0/O, 1/I/L).
  c := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '')
        from extensions.gen_random_bytes(8) b, generate_series(0, 7) i);
  insert into media.family_invites (code, family_id) values (c, fid);
  return c;
end $$;

create or replace function media.cancel_family_invite(p_code text) returns void
language sql security definer set search_path = '' as $$
  delete from media.family_invites i
  using media.families f
  where i.code = upper(trim(p_code)) and i.family_id = f.id and f.owner = (select auth.uid());
$$;

create or replace function media.join_family(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv media.family_invites;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into inv from media.family_invites
  where code = upper(trim(p_code)) and used_by is null and expires_at > now()
  for update;
  if inv.code is null then raise exception 'invite not valid'; end if;
  if exists (select 1 from media.families where id = inv.family_id and owner = uid) then
    raise exception 'own family';
  end if;
  if exists (select 1 from media.families where owner = uid) then
    raise exception 'owns a family';
  end if;
  if exists (select 1 from media.family_members where user_id = uid) then
    raise exception 'already in a family';
  end if;
  insert into media.family_members (family_id, user_id, name)
  values (inv.family_id, uid, left(coalesce(nullif(trim(p_name), ''), 'Family member'), 40));
  update media.family_invites set used_by = uid, used_at = now() where code = inv.code;
  return inv.family_id;
end $$;

create or replace function media.leave_family() returns void
language sql security definer set search_path = '' as $$
  delete from media.family_members where user_id = (select auth.uid());
$$;

create or replace function media.remove_family_member(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  delete from media.family_members m
  using media.families f
  where m.family_id = f.id and f.owner = (select auth.uid()) and m.user_id = p_user;
$$;

/** Deleting the family removes every member's access to the owner's keys. */
create or replace function media.delete_family() returns void
language sql security definer set search_path = '' as $$
  delete from media.families where owner = (select auth.uid());
$$;

/** For a member: the family owner's synced settings (service keys and IPTV logins). */
create or replace function media.get_family_secrets() returns table (name text, value text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.name,
         extensions.pgp_sym_decrypt(s.ciphertext,
           (select decrypted_secret from vault.decrypted_secrets where name = 'jl_media_secrets_key')),
         s.updated_at
  from media.family_members m
  join media.families f on f.id = m.family_id
  join media.secrets s on s.owner = f.owner
  where m.user_id = (select auth.uid()) and s.name like 'setting:%';
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'my_family()', 'create_family(text)', 'create_family_invite()', 'cancel_family_invite(text)',
    'join_family(text, text)', 'leave_family()', 'remove_family_member(uuid)', 'delete_family()',
    'get_family_secrets()'
  ] loop
    execute format('revoke all on function media.%s from public, anon', fn);
    execute format('grant execute on function media.%s to authenticated', fn);
  end loop;
end $$;
