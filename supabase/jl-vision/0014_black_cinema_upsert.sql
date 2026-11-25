-- Adds or updates Black Cinema titles from the master list (black-cinema-sync's seed action).
-- Categories are merged, never replaced, so rows TMDB added (genres, Tyler Perry, Spike Lee,
-- holiday, stand-up) survive a re-read of the list. Only the service role may call it.
create or replace function public.black_cinema_upsert(rows jsonb) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.black_cinema_titles as t
    (title, release_year, media_type, decade, categories, original_network, networks, franchise)
  select r.title, r.release_year, r.media_type, r.decade, coalesce(r.categories, '{}'),
         r.original_network, coalesce(r.networks, '{}'), r.franchise
  from jsonb_to_recordset(rows) as r(
    title text, release_year integer, media_type text, decade text, categories text[],
    original_network text, networks text[], franchise text)
  on conflict (title_key, media_type, release_year) do update set
    categories = array(select distinct c from unnest(t.categories || excluded.categories) as c),
    original_network = coalesce(excluded.original_network, t.original_network),
    networks = array(select distinct x from unnest(t.networks || excluded.networks) as x),
    franchise = coalesce(excluded.franchise, t.franchise),
    decade = excluded.decade;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.black_cinema_upsert(jsonb) from public, anon, authenticated;
grant execute on function public.black_cinema_upsert(jsonb) to service_role;
