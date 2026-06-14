-- Re-invited users auto-reconnect: when a user logs in, link any pending
-- estate invites (auth_user_id IS NULL) that match their own email to their
-- account. SECURITY DEFINER so it works without a broad RLS update policy, and
-- it ONLY sets auth_user_id (never role) — no self-escalation possible.
create or replace function claim_my_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare v_email text; v_count int;
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null then return 0; end if;
  update estate_users
     set auth_user_id = auth.uid()
   where auth_user_id is null
     and lower(email) = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
