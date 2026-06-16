-- SECURITY: the estates table had an over-broad SELECT policy
-- (estates_read_admin_email USING "auth.uid() IS NOT NULL"), which — because
-- RLS policies are OR'd — let ANY authenticated user read EVERY estate row,
-- including intake_answers PII, across all families. Drop it. Legitimate read
-- access remains via:
--   * estate_users_select  (id IN estates where the user is a member)
--   * estate_admin_all      (administrators, via get_estate_role)
drop policy if exists "estates_read_admin_email" on estates;
