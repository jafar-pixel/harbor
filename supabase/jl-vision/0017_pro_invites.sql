-- Pro invitations by email, so family and friends get Pro the moment they sign in with the
-- invited address, even when their JL account does not exist yet. Only the project administrator
-- edits this list (SQL editor or service role); nobody can read it through the API.
create table if not exists public.jl_pro_invites (
  email text primary key check (email = lower(btrim(email))),
  note text,
  invited_at timestamptz not null default now()
);

alter table public.jl_pro_invites enable row level security;
revoke all on public.jl_pro_invites from public, anon, authenticated;

-- A member by account id, or a signed-in user whose verified email is on the invitation list.
create or replace function public.jl_has_pro_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.jl_pro_members where user_id = (select auth.uid()))
    or exists (
      select 1
      from auth.users u
      join public.jl_pro_invites i on i.email = lower(u.email)
      where u.id = (select auth.uid()) and u.email_confirmed_at is not null
    );
$$;

revoke all on function public.jl_has_pro_access() from public, anon;
grant execute on function public.jl_has_pro_access() to authenticated;

notify pgrst, 'reload schema';
