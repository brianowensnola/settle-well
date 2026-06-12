-- Allow authenticated users to INSERT new estates
-- (they will be linked as admin in estate_users immediately after via the app)
create policy "users_create_estates"
  on estates for insert
  with check (auth.role() = 'authenticated');

-- Allow authenticated users to UPDATE their own estates (as admins)
create policy "estate_admin_update"
  on estates for update
  using (get_estate_role(id) = 'administrator'::text)
  with check (get_estate_role(id) = 'administrator'::text);

-- Allow authenticated users to DELETE their own estates (as admins)
create policy "estate_admin_delete"
  on estates for delete
  using (get_estate_role(id) = 'administrator'::text);
