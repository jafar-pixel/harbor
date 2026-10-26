-- What each of a listener's devices is playing, so every other device can show it and pick it
-- up ("Listening on Desktop: Award Tour · Play here"). One row per device, written every few
-- seconds while music plays; only the owner can read or write their rows.

create table if not exists media.now_playing (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id text not null check (device_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  device_name text not null check (char_length(device_name) between 1 and 60),
  device_kind text not null check (device_kind in ('desktop', 'web', 'android')),
  title text not null check (char_length(title) between 1 and 160),
  artist text not null default '' check (char_length(artist) <= 120),
  art text check (char_length(art) <= 600),
  video_id text check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  source text not null default 'music' check (source in ('dj', 'music', 'lounge', 'radio', 'tv')),
  position_s real not null default 0 check (position_s >= 0),
  duration_s real check (duration_s >= 0),
  paused boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
create index if not exists now_playing_user_idx on media.now_playing (user_id, updated_at desc);

alter table media.now_playing enable row level security;
create policy now_playing_own on media.now_playing for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on media.now_playing to authenticated;
