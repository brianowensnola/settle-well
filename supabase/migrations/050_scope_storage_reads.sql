-- Scope estate-documents reads/deletes to the estate the file belongs to (by
-- path prefix "<estateId>/..." or "estate-<estateId>/..."), or the uploader.
-- Closes the prior hole where any authenticated user could read ANY file.
create or replace function user_can_access_storage(object_name text) returns boolean
language plpgsql security definer stable set search_path = public as $$
declare seg text; eid uuid;
begin
  seg := split_part(object_name, '/', 1);
  if seg like 'estate-%' then seg := substring(seg from 8); end if;
  begin eid := seg::uuid; exception when others then return false; end;
  return exists (select 1 from estate_users where estate_id = eid and auth_user_id = auth.uid());
end $$;

drop policy if exists "storage_admin_read" on storage.objects;
create policy "storage_member_read" on storage.objects for select
  using (bucket_id = 'estate-documents' and (owner = auth.uid() or user_can_access_storage(name)));

drop policy if exists "storage_admin_delete" on storage.objects;
create policy "storage_member_delete" on storage.objects for delete
  using (bucket_id = 'estate-documents' and (owner = auth.uid() or user_can_access_storage(name)));

-- INSERT stays as-is (any authenticated) so non-estate-path uploads like
-- family-mail/ keep working; reads are where the leak was.
