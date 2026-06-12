-- Allow authenticated users to insert new estates (they will be linked as admin in estate_users)
drop policy if exists "Users can create estates" on estates;

create policy "Users can create estates"
  on estates for insert
  with check (auth.role() = 'authenticated');

-- Also allow users to view estates they own
drop policy if exists "Users can view their estates" on estates;

create policy "Users can view their estates"
  on estates for select
  using (
    id in (
      select estate_id from estate_users
      where auth_user_id = auth.uid()
    )
  );
