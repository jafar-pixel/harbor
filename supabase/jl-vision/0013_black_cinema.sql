-- Black Cinema hub: the master catalog of Black movies and television (JL Media Vision).
-- Rows come from supabase/jl-vision/black-cinema (the owner's list and Black Box's collections);
-- the black-cinema-sync edge function fills in TMDB (or Trakt) ids, artwork, genres and popularity.
-- Everyone can read it, signed in or not; only the service role (the sync function) writes.

create table if not exists public.black_cinema_titles (
  id bigint generated always as identity primary key,
  title text not null,
  title_key text generated always as (lower(regexp_replace(title, '[^A-Za-z0-9]+', '', 'g'))) stored,
  release_year integer not null,
  media_type text not null check (media_type in ('movie', 'series')),
  collection text not null default 'Black Cinema',
  decade text,
  categories text[] not null default '{}',
  original_network text,
  networks text[] not null default '{}',
  franchise text,
  genres text[] not null default '{}',
  tmdb_id integer,
  imdb_id text,
  trakt_id integer,
  poster_path text,
  backdrop_path text,
  overview text,
  release_date date,
  popularity real,
  vote_average real,
  vote_count integer,
  streaming_providers jsonb not null default '[]'::jsonb,
  -- pending: not looked up yet; found: TMDB; trakt: found on Trakt only; not_found: neither yet.
  lookup_status text not null default 'pending'
    check (lookup_status in ('pending', 'found', 'trakt', 'not_found')),
  lookup_attempts integer not null default 0,
  looked_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title_key, media_type, release_year)
);

create index if not exists black_cinema_titles_categories_idx
  on public.black_cinema_titles using gin (categories);
create index if not exists black_cinema_titles_popularity_idx
  on public.black_cinema_titles (popularity desc nulls last);
create index if not exists black_cinema_titles_lookup_idx
  on public.black_cinema_titles (lookup_status, looked_up_at nulls first);

alter table public.black_cinema_titles enable row level security;

drop policy if exists black_cinema_titles_public_read on public.black_cinema_titles;
create policy black_cinema_titles_public_read
  on public.black_cinema_titles for select
  to anon, authenticated
  using (true);

create or replace function public.black_cinema_touch() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists black_cinema_titles_touch on public.black_cinema_titles;
create trigger black_cinema_titles_touch
  before update on public.black_cinema_titles
  for each row execute function public.black_cinema_touch();
