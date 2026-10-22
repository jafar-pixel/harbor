-- Private JL remote channels are restricted to the authenticated account.
create policy jl_remote_receive on realtime.messages for select to authenticated
using (extension = 'broadcast' and (select realtime.topic()) = 'jl-remote:' || (select auth.uid())::text);
create policy jl_remote_send on realtime.messages for insert to authenticated
with check (extension = 'broadcast' and (select realtime.topic()) = 'jl-remote:' || (select auth.uid())::text);
-- Keep future broad policies from opening another account's JL remote topic.
create policy jl_remote_receive_fence on realtime.messages as restrictive for select to authenticated
using (coalesce((select realtime.topic()), '') not like 'jl-remote:%' or (select realtime.topic()) = 'jl-remote:' || (select auth.uid())::text);
create policy jl_remote_send_fence on realtime.messages as restrictive for insert to authenticated
with check (coalesce((select realtime.topic()), '') not like 'jl-remote:%' or (select realtime.topic()) = 'jl-remote:' || (select auth.uid())::text);
