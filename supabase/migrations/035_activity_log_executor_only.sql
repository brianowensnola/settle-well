-- Activity log is now executor-only (was readable by heir/observer/collaborator).
drop policy if exists "activity_read" on estate_activity_log;
create policy "activity_read" on estate_activity_log for select
  using (get_estate_role(estate_id) = 'administrator');
