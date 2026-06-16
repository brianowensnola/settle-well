-- SECURITY: drop the over-broad self-insert policy that let any authenticated
-- user insert a membership row for themselves into ANY estate (self-granted
-- access / privilege escalation). Deploy the RPC-based creation flow (055 +
-- client using claim_new_estate_admin) BEFORE applying this.
-- Legitimate paths after this:
--   * estate creation -> claim_new_estate_admin() RPC (SECURITY DEFINER)
--   * executor adds others -> estate_users_admin_all (administrator)
--   * invite acceptance -> UPDATE of the pending row (auto-link on login)
drop policy if exists "estate_users_self_insert" on estate_users;
