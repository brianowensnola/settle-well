-- Security hardening: enforce private items at the database level, and make
-- the new 'collaborator' role functional on non-private tasks.

-- Tasks: heir/observer/collaborator may read only NON-private tasks.
-- Private/forensic tasks remain readable by the executor (administrator) alone.
drop policy if exists "tasks_non_admin_read" on estate_tasks;
create policy "tasks_non_admin_read"
  on estate_tasks for select
  using (
    get_estate_role(estate_id) = any (array['heir', 'observer', 'collaborator'])
    and is_private = false
  );

-- Collaborator may update (work) non-private tasks.
drop policy if exists "tasks_collaborator_update" on estate_tasks;
create policy "tasks_collaborator_update"
  on estate_tasks for update
  using (get_estate_role(estate_id) = 'collaborator' and is_private = false)
  with check (get_estate_role(estate_id) = 'collaborator' and is_private = false);

-- Task notes: non-admins may read notes only on non-private tasks.
drop policy if exists "task_logs_non_admin_read" on estate_task_logs;
create policy "task_logs_non_admin_read"
  on estate_task_logs for select
  using (
    get_estate_role(estate_id) = any (array['heir', 'observer', 'collaborator'])
    and task_id in (select id from estate_tasks where is_private = false)
  );

-- Collaborator may add notes on non-private tasks.
drop policy if exists "task_logs_collaborator_insert" on estate_task_logs;
create policy "task_logs_collaborator_insert"
  on estate_task_logs for insert
  with check (
    get_estate_role(estate_id) = 'collaborator'
    and task_id in (select id from estate_tasks where is_private = false)
  );

-- NOTE: estate_financials is already executor-only (financials_admin ALL policy),
-- so private financials are not readable by other roles. No change needed.
