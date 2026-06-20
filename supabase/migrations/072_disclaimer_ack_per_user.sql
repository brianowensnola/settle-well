-- Acknowledgment is once per EXECUTOR (ever), not per estate. Mark all of the
-- caller's estate_users rows acknowledged so they're never re-prompted on any
-- estate, current or future.
create or replace function public.acknowledge_disclaimer(p_estate_id uuid default null)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  update estate_users set disclaimer_ack_at = now()
  where auth_user_id = auth.uid() and disclaimer_ack_at is null;
end $$;

revoke execute on function public.acknowledge_disclaimer(uuid) from anon, public;
grant execute on function public.acknowledge_disclaimer(uuid) to authenticated;
