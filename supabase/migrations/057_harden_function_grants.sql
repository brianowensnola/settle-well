-- Security-advisor hardening:
-- 1. Pin search_path on get_estate_role (was flagged "mutable search_path").
-- 2. Trigger-only functions are not meant to be REST-callable — revoke EXECUTE
--    from anon/authenticated/public. Triggers still fire (they run as the table
--    owner, independent of EXECUTE grants). NOTE: Supabase grants anon/
--    authenticated DIRECTLY, so revoking only from PUBLIC is not enough.
-- 3. The three real RPCs are signed-in only (drop anon; keep authenticated).
--
-- Not changed: RLS-helper SECURITY DEFINER functions (can_see_contact,
-- can_use_mail, is_family_admin, user_admins_any, user_in_group,
-- user_can_access_storage, get_estate_role) remain executable by authenticated
-- because RLS policy evaluation requires it. They only return the caller's own
-- access booleans/role, so REST exposure is low-risk (standard Supabase pattern).

create or replace function public.get_estate_role(p_estate_id uuid)
returns text language sql security definer set search_path = public as $$
  select role from estate_users
  where estate_id = p_estate_id and auth_user_id = auth.uid()
  limit 1;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.trg_log_document()','public.trg_log_estate()','public.trg_log_financial()',
    'public.trg_log_note()','public.trg_log_task()','public.trg_log_user()',
    'public.trg_task_approval()','public.mark_estate_dirty()','public.cleanup_orphan_group()',
    'public.sync_user_to_contact()','public.sync_contact_from_user()',
    'public.log_activity(uuid, text, text, uuid, text, text, boolean)'
  ] loop
    execute format('revoke execute on function %s from anon, authenticated, public', fn);
  end loop;
end $$;

revoke execute on function public.claim_my_invites() from anon, public;
revoke execute on function public.claim_new_estate_admin(uuid) from anon, public;
revoke execute on function public.estate_transparency(uuid) from anon, public;
grant execute on function public.claim_my_invites() to authenticated;
grant execute on function public.claim_new_estate_admin(uuid) to authenticated;
grant execute on function public.estate_transparency(uuid) to authenticated;
