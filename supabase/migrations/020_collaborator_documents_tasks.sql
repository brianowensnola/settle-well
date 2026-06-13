-- Let the Collaborator role read/insert/update non-private documents (e.g. mail
-- uploads) and create non-private tasks (the auto "review mail" task).
drop policy if exists "documents_non_admin_read" on estate_documents;
create policy "documents_non_admin_read"
  on estate_documents for select
  using (get_estate_role(estate_id) = any (array['heir', 'observer', 'collaborator']) and is_private = false);

drop policy if exists "documents_collaborator_insert" on estate_documents;
create policy "documents_collaborator_insert"
  on estate_documents for insert
  with check (get_estate_role(estate_id) = 'collaborator' and is_private = false);

drop policy if exists "documents_collaborator_update" on estate_documents;
create policy "documents_collaborator_update"
  on estate_documents for update
  using (get_estate_role(estate_id) = 'collaborator' and is_private = false)
  with check (get_estate_role(estate_id) = 'collaborator' and is_private = false);

drop policy if exists "tasks_collaborator_insert" on estate_tasks;
create policy "tasks_collaborator_insert"
  on estate_tasks for insert
  with check (get_estate_role(estate_id) = 'collaborator' and is_private = false);
