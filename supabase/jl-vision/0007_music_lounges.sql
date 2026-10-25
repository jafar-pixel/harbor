-- Listening Lounge: a host plays a set and everyone in the lounge hears the same song at the
-- same moment. The host writes what's on (video and when it started); guests read it every few
-- seconds and line up. Guests join by invite or code, react and request songs.

create table if not exists media.lounges (
  id uuid primary key default gen_random_uuid(),
  host uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  vibe text check (char_length(vibe) <= 200),
  code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
    check (code ~ '^[A-Z0-9]{6}$'),
  now_video_id text check (now_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  now_artist text check (char_length(now_artist) <= 80),
  now_title text check (char_length(now_title) <= 120),
  -- When the song on would have started had it never been paused; position = now() - started_at.
  started_at timestamptz,
  paused_at timestamptz,
  ended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lounges_host_idx on media.lounges (host);

create table if not exists media.lounge_members (
  lounge_id uuid not null references media.lounges (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (lounge_id, user_id)
);

create table if not exists media.lounge_invites (
  lounge_id uuid not null references media.lounges (id) on delete cascade,
  invitee uuid not null references auth.users (id) on delete cascade,
  inviter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lounge_id, invitee)
);
create index if not exists lounge_invites_invitee_idx on media.lounge_invites (invitee);

create table if not exists media.lounge_events (
  id bigint generated always as identity primary key,
  lounge_id uuid not null references media.lounges (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  kind text not null check (kind in ('reaction', 'request', 'chat')),
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists lounge_events_lounge_idx on media.lounge_events (lounge_id, id);

create or replace function media.is_lounge_member(p_lounge uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from media.lounges l where l.id = p_lounge and l.host = auth.uid())
      or exists (
        select 1 from media.lounge_members m where m.lounge_id = p_lounge and m.user_id = auth.uid()
      );
$$;

alter table media.lounges enable row level security;
alter table media.lounge_members enable row level security;
alter table media.lounge_invites enable row level security;
alter table media.lounge_events enable row level security;

-- The host check is inline: a host reading back the row they just created can't rely on
-- is_lounge_member, whose snapshot doesn't see the new row yet.
create policy lounges_read on media.lounges for select to authenticated
  using (
    host = auth.uid()
    or media.is_lounge_member(id)
    or exists (select 1 from media.lounge_invites i where i.lounge_id = id and i.invitee = auth.uid())
  );
create policy lounges_create on media.lounges for insert to authenticated
  with check (host = auth.uid());
create policy lounges_host_update on media.lounges for update to authenticated
  using (host = auth.uid()) with check (host = auth.uid());
create policy lounges_host_delete on media.lounges for delete to authenticated
  using (host = auth.uid());

create policy lounge_members_read on media.lounge_members for select to authenticated
  using (media.is_lounge_member(lounge_id));
create policy lounge_members_seen on media.lounge_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy lounge_members_leave on media.lounge_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from media.lounges l where l.id = lounge_id and l.host = auth.uid())
  );

create policy lounge_invites_read on media.lounge_invites for select to authenticated
  using (invitee = auth.uid() or inviter = auth.uid());
-- Only the host invites, and only their friends.
create policy lounge_invites_send on media.lounge_invites for insert to authenticated
  with check (
    inviter = auth.uid()
    and exists (select 1 from media.lounges l where l.id = lounge_id and l.host = auth.uid())
    and media.are_music_friends(auth.uid(), invitee)
  );
create policy lounge_invites_dismiss on media.lounge_invites for delete to authenticated
  using (invitee = auth.uid() or inviter = auth.uid());

create policy lounge_events_read on media.lounge_events for select to authenticated
  using (media.is_lounge_member(lounge_id));
create policy lounge_events_post on media.lounge_events for insert to authenticated
  with check (user_id = auth.uid() and media.is_lounge_member(lounge_id));

-- Join by code (anyone with it) or by invite. Re-joining keeps your place; returns the lounge id.
create or replace function media.join_lounge(p_code text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_lounge uuid;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select id into v_lounge from media.lounges
  where (code = upper(trim(p_code)) or id::text = trim(p_code)) and not ended;
  if v_lounge is null then raise exception 'no open lounge with that code' using errcode = 'P0002'; end if;
  if trim(p_code) = v_lounge::text and not exists (
    select 1 from media.lounge_invites where lounge_id = v_lounge and invitee = auth.uid()
  ) and not exists (select 1 from media.lounges where id = v_lounge and host = auth.uid()) then
    raise exception 'no open lounge with that code' using errcode = 'P0002';
  end if;
  insert into media.lounge_members (lounge_id, user_id, display_name)
  values (v_lounge, auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'Guest'), 40))
  on conflict (lounge_id, user_id) do update set last_seen = now();
  delete from media.lounge_invites where lounge_id = v_lounge and invitee = auth.uid();
  return v_lounge;
end;
$$;

-- Lounges the viewer was invited to, with who invited them.
create or replace function media.my_lounge_invites()
returns table (lounge_id uuid, name text, vibe text, host_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, l.name, l.vibe, coalesce(h.display_name, 'A friend'), i.created_at
  from media.lounge_invites i
  join media.lounges l on l.id = i.lounge_id and not l.ended
  left join media.music_handles h on h.user_id = i.inviter
  where i.invitee = auth.uid()
  order by i.created_at desc;
$$;

-- The server's clock, so every listener lines up on the same time.
create or replace function media.lounge_now()
returns timestamptz language sql stable as $$ select now() $$;

revoke all on function media.is_lounge_member(uuid) from public;
grant execute on function media.is_lounge_member(uuid) to authenticated;
revoke all on function media.join_lounge(text, text) from public;
grant execute on function media.join_lounge(text, text) to authenticated;
revoke all on function media.my_lounge_invites() from public;
grant execute on function media.my_lounge_invites() to authenticated;
revoke all on function media.lounge_now() from public;
grant execute on function media.lounge_now() to authenticated;

revoke all on media.lounges from anon, authenticated;
revoke all on media.lounge_members from anon, authenticated;
revoke all on media.lounge_invites from anon, authenticated;
revoke all on media.lounge_events from anon, authenticated;
grant select, insert, delete on media.lounges to authenticated;
grant update (name, vibe, now_video_id, now_artist, now_title, started_at, paused_at, ended, updated_at)
  on media.lounges to authenticated;
grant select, delete on media.lounge_members to authenticated;
grant update (last_seen) on media.lounge_members to authenticated;
grant select, insert, delete on media.lounge_invites to authenticated;
grant select, insert on media.lounge_events to authenticated;
