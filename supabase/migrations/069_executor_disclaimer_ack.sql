-- Record when an executor acknowledges their fiduciary-responsibility notice
-- for an estate (shown once per estate until acknowledged).
alter table estate_users add column if not exists disclaimer_ack_at timestamptz;

create or replace function public.acknowledge_disclaimer(p_estate_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  update estate_users set disclaimer_ack_at = now()
  where estate_id = p_estate_id and auth_user_id = auth.uid();
end $$;

revoke execute on function public.acknowledge_disclaimer(uuid) from anon, public;
grant execute on function public.acknowledge_disclaimer(uuid) to authenticated;
