-- Black Cinema sync: a random token in the vault, readable only by the service role (the sync
-- function checks the token the schedule sends), and the schedule itself (pg_cron + pg_net):
-- lookups and refreshes every 5 minutes, a re-read of the master list every night.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'black_cinema_sync_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'black_cinema_sync_token',
      'Sent by the schedule to black-cinema-sync, which checks it');
  end if;
end;
$$;

create or replace function public.black_cinema_sync_token() returns text
  language sql
  security definer
  set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'black_cinema_sync_token';
$$;

revoke execute on function public.black_cinema_sync_token() from public, anon, authenticated;
grant execute on function public.black_cinema_sync_token() to service_role;

create extension if not exists pg_cron;

create or replace function public.black_cinema_sync_call(body jsonb) returns bigint
  language sql
  security definer
  set search_path = ''
as $$
  select net.http_post(
    url := 'https://ajbjyjfiglzodbdcdapr.supabase.co/functions/v1/black-cinema-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'black_cinema_sync_token')),
    body := body,
    timeout_milliseconds := 150000);
$$;

revoke execute on function public.black_cinema_sync_call(jsonb) from public, anon, authenticated;

select cron.schedule('black-cinema-run', '*/5 * * * *',
  $job$ select public.black_cinema_sync_call('{"action":"run","limit":60}'::jsonb) $job$);
select cron.schedule('black-cinema-seed', '23 9 * * *',
  $job$ select public.black_cinema_sync_call('{"action":"seed","ref":"web-self-host"}'::jsonb) $job$);
