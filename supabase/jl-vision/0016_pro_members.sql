-- Membership is provisioned by the project administrator using an authenticated user's ID.
create table if not exists public.jl_pro_members (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.jl_pro_members enable row level security;
revoke all on public.jl_pro_members from public, anon, authenticated;
grant select on public.jl_pro_members to authenticated;

create policy "Members can read their own Pro membership"
  on public.jl_pro_members for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.jl_has_pro_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.jl_pro_members where user_id = (select auth.uid())
  );
$$;

revoke all on function public.jl_has_pro_access() from public, anon;
grant execute on function public.jl_has_pro_access() to authenticated;
