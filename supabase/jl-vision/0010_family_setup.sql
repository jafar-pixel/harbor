-- Family, part two: the owner invites by email (the family-invite function creates the account)
-- and sets up a member's own providers. A member's own key wins over the family's.

/** For the family-invite function only: an account id from an email address. */
create or replace function media.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

/** For the family-invite function only: adds an account to the owner's family. */
create or replace function media.add_family_member(p_owner uuid, p_user uuid, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  fid uuid;
begin
  insert into media.families (owner) values (p_owner) on conflict (owner) do nothing;
  select id into fid from media.families where owner = p_owner;
  if p_user = p_owner then return 'self'; end if;
  if exists (select 1 from media.family_members where user_id = p_user and family_id = fid) then
    return 'already';
  end if;
  if exists (select 1 from media.family_members where user_id = p_user)
     or exists (select 1 from media.families where owner = p_user) then
    return 'other-family';
  end if;
  insert into media.family_members (family_id, user_id, name)
  values (fid, p_user, left(coalesce(nullif(trim(p_name), ''), 'Family member'), 40));
  return 'added';
end $$;

create or replace function media.owns_member(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from media.family_members m join media.families f on f.id = m.family_id
    where m.user_id = p_user and f.owner = (select auth.uid()));
$$;

/** The owner sets one of a member's own providers (their own key wins over the family's). */
create or replace function media.set_member_secret(p_user uuid, p_name text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k text := (select decrypted_secret from vault.decrypted_secrets where name = 'jl_media_secrets_key');
begin
  if not media.owns_member(p_user) then raise exception 'not your family member'; end if;
  if p_name not like 'setting:%' then raise exception 'not a provider setting'; end if;
  if p_value is null or p_value = '' then
    delete from media.secrets where owner = p_user and name = p_name;
    return;
  end if;
  insert into media.secrets (owner, name, ciphertext, updated_at)
  values (p_user, p_name, extensions.pgp_sym_encrypt(p_value, k), now())
  on conflict (owner, name) do update set ciphertext = excluded.ciphertext, updated_at = now();
end $$;

/** Which of a member's own providers are set; names only, never the keys. */
create or replace function media.member_secret_names(p_user uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select s.name from media.secrets s
  where s.owner = p_user and s.name like 'setting:%' and media.owns_member(p_user);
$$;

revoke all on function media.user_id_by_email(text) from public, anon, authenticated;
revoke all on function media.add_family_member(uuid, uuid, text) from public, anon, authenticated;
grant execute on function media.user_id_by_email(text) to service_role;
grant execute on function media.add_family_member(uuid, uuid, text) to service_role;
do $$
declare fn text;
begin
  foreach fn in array array['owns_member(uuid)', 'set_member_secret(uuid, text, text)', 'member_secret_names(uuid)'] loop
    execute format('revoke all on function media.%s from public, anon', fn);
    execute format('grant execute on function media.%s to authenticated', fn);
  end loop;
end $$;
