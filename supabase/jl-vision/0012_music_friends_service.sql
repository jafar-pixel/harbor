-- The music-friends edge function (service role) reads friends, names, now playing and lounges
-- to show a listener what their accepted friends are playing, and adds friendships and lounge
-- members on their behalf. RLS stays as it is for signed-in clients.
grant usage on schema media to service_role;
grant select, insert, update on media.music_friends to service_role;
grant select on media.music_handles to service_role;
grant select on media.now_playing to service_role;
grant select on media.lounges to service_role;
grant select, insert, update on media.lounge_members to service_role;
grant execute on function media.are_music_friends(uuid, uuid) to service_role;
