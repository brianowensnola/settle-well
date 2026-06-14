-- Allow deleting files from the estate-documents bucket so removing a document
-- (or dismissing mail) can purge the underlying file, not just the DB row.
-- Mirrors the existing permissive read/upload policies (any authenticated user).
drop policy if exists "storage_admin_delete" on storage.objects;
create policy "storage_admin_delete" on storage.objects for delete
  using (bucket_id = 'estate-documents' and auth.uid() is not null);
