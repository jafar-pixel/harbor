-- Music Hub friends and "Send a song". Friends find each other by handle; a friendship starts
-- as a request and becomes mutual when accepted. Songs can only be sent between friends.
-- Everything is enforced here: RLS policies, column grants and security-definer functions.

create table if not exists media.music_handles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table if not exists media.music_friends (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index if not exists music_friends_addressee_idx on media.music_friends (addressee);

create table if not exists media.song_shares (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient uuid not null references auth.users (id) on delete cascade,
  artist text not null check (char_length(artist) between 1 and 80),
  title text not null check (char_length(title) between 1 and 120),
  video_id text check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists song_shares_recipient_idx on media.song_shares (recipient, created_at desc);

create or replace function media.are_music_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from media.music_friends f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;

alter table media.music_handles enable row level security;
alter table media.music_friends enable row level security;
alter table media.song_shares enable row level security;

-- Handles are how friends find each other, so any signed-in account may read them.
drop policy if exists music_handles_read on media.music_handles;
create policy music_handles_read on media.music_handles for select to authenticated using (true);
drop policy if exists music_handles_own on media.music_handles;
create policy music_handles_own on media.music_handles for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists music_handles_update_own on media.music_handles;
create policy music_handles_update_own on media.music_handles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists music_friends_read on media.music_friends;
create policy music_friends_read on media.music_friends for select to authenticated
  using (auth.uid() in (requester, addressee));
drop policy if exists music_friends_accept on media.music_friends;
create policy music_friends_accept on media.music_friends for update to authenticated
  using (addressee = auth.uid()) with check (addressee = auth.uid());
drop policy if exists music_friends_remove on media.music_friends;
create policy music_friends_remove on media.music_friends for delete to authenticated
  using (auth.uid() in (requester, addressee));

drop policy if exists song_shares_read on media.song_shares;
create policy song_shares_read on media.song_shares for select to authenticated
  using (auth.uid() in (sender, recipient));
drop policy if exists song_shares_send on media.song_shares;
create policy song_shares_send on media.song_shares for insert to authenticated
  with check (sender = auth.uid() and media.are_music_friends(sender, recipient));
drop policy if exists song_shares_mark_read on media.song_shares;
create policy song_shares_mark_read on media.song_shares for update to authenticated
  using (recipient = auth.uid()) with check (recipient = auth.uid());
drop policy if exists song_shares_delete on media.song_shares;
create policy song_shares_delete on media.song_shares for delete to authenticated
  using (auth.uid() in (sender, recipient));

-- Ask for (or accept) a friendship by handle. A request the other person already sent is
-- accepted instead of making a second one.
create or replace function media.request_music_friend(p_handle text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_them uuid;
begin
  if v_me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select user_id into v_them from media.music_handles where handle = lower(trim(p_handle));
  if v_them is null then raise exception 'no one has that handle' using errcode = 'P0002'; end if;
  if v_them = v_me then raise exception 'that is your own handle' using errcode = '22023'; end if;
  if exists (select 1 from media.music_friends where requester = v_them and addressee = v_me) then
    update media.music_friends set status = 'accepted' where requester = v_them and addressee = v_me;
    return 'accepted';
  end if;
  insert into media.music_friends (requester, addressee) values (v_me, v_them)
  on conflict (requester, addressee) do nothing;
  return 'requested';
end;
$$;

-- The viewer's friends and requests, with names.
create or replace function media.my_music_friends()
returns table (user_id uuid, handle text, display_name text, status text, incoming boolean)
language sql stable security definer set search_path = '' as $$
  select h.user_id, h.handle, h.display_name, f.status, f.addressee = auth.uid()
  from media.music_friends f
  join media.music_handles h
    on h.user_id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by f.status, h.display_name;
$$;

-- Songs sent to the viewer, newest first, with the sender's name.
create or replace function media.my_song_inbox(p_limit int default 50)
returns table (
  id uuid, sender uuid, sender_name text, artist text, title text, video_id text,
  note text, created_at timestamptz, read_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.sender, coalesce(h.display_name, 'A friend'), s.artist, s.title, s.video_id,
         s.note, s.created_at, s.read_at
  from media.song_shares s
  left join media.music_handles h on h.user_id = s.sender
  where s.recipient = auth.uid()
  order by s.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

revoke all on function media.are_music_friends(uuid, uuid) from public;
grant execute on function media.are_music_friends(uuid, uuid) to authenticated;
revoke all on function media.request_music_friend(text) from public;
grant execute on function media.request_music_friend(text) to authenticated;
revoke all on function media.my_music_friends() from public;
grant execute on function media.my_music_friends() to authenticated;
revoke all on function media.my_song_inbox(int) from public;
grant execute on function media.my_song_inbox(int) to authenticated;

revoke all on media.music_handles from anon, authenticated;
revoke all on media.music_friends from anon, authenticated;
revoke all on media.song_shares from anon, authenticated;
grant select, insert on media.music_handles to authenticated;
grant update (handle, display_name) on media.music_handles to authenticated;
grant select, delete on media.music_friends to authenticated;
grant update (status) on media.music_friends to authenticated;
grant select, insert, delete on media.song_shares to authenticated;
grant update (read_at) on media.song_shares to authenticated;
