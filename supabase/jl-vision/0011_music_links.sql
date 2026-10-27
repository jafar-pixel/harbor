-- Music sign ins kept with the JL account, so a listener connects YouTube or Spotify once and
-- every device signed in to that account stays connected. Refresh tokens are encrypted with the
-- media.secrets key and never leave the server: the music-link edge function (service role)
-- reads them and hands devices short-lived access tokens. Each account links its own services;
-- family sharing (get_family_secrets) does not include them.

create table if not exists media.music_links (
  owner uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('spotify', 'youtube')),
  refresh_ct bytea not null,
  access_ct bytea,
  access_expires timestamptz,
  scope text not null default '',
  updated_at timestamptz not null default now(),
  primary key (owner, provider)
);
alter table media.music_links enable row level security;
-- No policies: reached only through the functions below.
revoke all on media.music_links from anon, authenticated;

-- Which service leads the Music Hub and the Lounge art.
create table if not exists media.music_prefs (
  owner uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  main_service text not null default 'youtube' check (main_service in ('youtube', 'spotify')),
  updated_at timestamptz not null default now()
);
alter table media.music_prefs enable row level security;
create policy music_prefs_own on media.music_prefs for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
grant select, insert, update, delete on media.music_prefs to authenticated;

-- The caller's linked services, without tokens.
create or replace function media.my_music_links()
returns table (provider text, scope text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.provider, l.scope, l.updated_at from media.music_links l
  where l.owner = (select auth.uid());
$$;
revoke all on function media.my_music_links() from public, anon;
grant execute on function media.my_music_links() to authenticated;

create or replace function media.music_link_read(p_owner uuid, p_provider text)
returns table (refresh text, access text, access_expires timestamptz, scope text)
language sql stable security definer set search_path = '' as $$
  with k as (select decrypted_secret as k from vault.decrypted_secrets where name = 'jl_media_secrets_key')
  select extensions.pgp_sym_decrypt(l.refresh_ct, k.k),
         case when l.access_ct is null then null else extensions.pgp_sym_decrypt(l.access_ct, k.k) end,
         l.access_expires, l.scope
  from media.music_links l, k
  where l.owner = p_owner and l.provider = p_provider;
$$;

create or replace function media.music_link_write(
  p_owner uuid, p_provider text, p_refresh text, p_access text, p_expires timestamptz, p_scope text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k text := (select decrypted_secret from vault.decrypted_secrets where name = 'jl_media_secrets_key');
begin
  if p_refresh is null or p_refresh = '' then
    delete from media.music_links where owner = p_owner and provider = p_provider;
    return;
  end if;
  insert into media.music_links (owner, provider, refresh_ct, access_ct, access_expires, scope, updated_at)
  values (p_owner, p_provider, extensions.pgp_sym_encrypt(p_refresh, k),
          case when p_access is null then null else extensions.pgp_sym_encrypt(p_access, k) end,
          p_expires, coalesce(p_scope, ''), now())
  on conflict (owner, provider) do update set
    refresh_ct = excluded.refresh_ct, access_ct = excluded.access_ct,
    access_expires = excluded.access_expires,
    scope = case when excluded.scope = '' then media.music_links.scope else excluded.scope end,
    updated_at = now();
end $$;

revoke all on function media.music_link_read(uuid, text) from public, anon, authenticated;
revoke all on function media.music_link_write(uuid, text, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function media.music_link_read(uuid, text) to service_role;
grant execute on function media.music_link_write(uuid, text, text, text, timestamptz, text)
  to service_role;

grant select on media.music_links to service_role;
