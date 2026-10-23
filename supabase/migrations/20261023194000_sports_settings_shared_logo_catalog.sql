-- Shared sports logos stay editable; personal artwork remains account scoped.
alter table public.football_logo_groups drop constraint football_logo_groups_league_check;
alter table public.football_logo_groups add constraint football_logo_groups_league_check
  check (league in ('ncaa-fbs', 'ncaa-diii', 'nfl', 'nba', 'mlb', 'nhl'));

create or replace view media.sports_teams with (security_invoker = true) as
select t.conference, t.sport, t.team_slug, t.team_name, t.mascot, g.league,
  case when t.asset_status in ('stored', 'approved') then t.storage_path else null::text end as logo_path,
  coalesce((
    select jsonb_agg(jsonb_build_object('provider', p.provider, 'league', p.provider_league, 'id', p.provider_team_id))
    from public.sports_team_provider_ids p
    where p.conference = t.conference and p.sport = t.sport and p.team_slug = t.team_slug
  ), '[]'::jsonb) as provider_ids,
  t.asset_status, t.source_reference_url, t.updated_at
from public.sports_team_logos t
join public.football_logo_groups g on g.slug = t.conference;

create policy media_art_sports_catalog_logo_read on storage.objects
for select to authenticated using (
  bucket_id = 'media-art' and (storage.foldername(name))[1] = 'sports-logos'
  and exists (
    select 1 from public.sports_team_logos t
    where t.storage_path = objects.name and t.asset_status in ('stored', 'approved')
  )
);

-- The application uses ESPN's path segment, not its display abbreviation.
insert into public.sports_team_provider_ids
  (conference, sport, team_slug, provider, provider_league, provider_team_id)
select conference, sport, team_slug, provider, 'college-football', provider_team_id
from public.sports_team_provider_ids where provider = 'espn' and provider_league = 'ncaaf'
on conflict do nothing;
