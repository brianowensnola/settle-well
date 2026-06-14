-- Collaborators couldn't read estate_sections (phases), so the Tasks
-- "Group by: Phase" view was empty for them. The original non-admin read policy
-- predated the collaborator role. Add collaborator alongside heir/observer.
drop policy if exists "sections_non_admin_read" on estate_sections;
create policy "sections_non_admin_read"
  on estate_sections for select
  using (
    get_estate_role(estate_id) = any (array['heir','observer','collaborator'])
    and is_private = false
  );
