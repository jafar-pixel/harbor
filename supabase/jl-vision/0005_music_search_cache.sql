-- Music search cache (Music Hub vibes and AI DJ). The music-search edge function stores each
-- YouTube search here so a query costs YouTube quota once for every user. Only the function
-- (service role) reads or writes it: RLS is on with no policies.

create table if not exists media.music_search_cache (
  q text primary key check (char_length(q) between 1 and 200),
  results jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array'),
  fetched_at timestamptz not null default now()
);

alter table media.music_search_cache enable row level security;
revoke all on media.music_search_cache from anon, authenticated;
