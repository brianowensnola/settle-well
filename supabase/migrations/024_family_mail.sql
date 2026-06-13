-- Family-level mail intake: ONE inbox for the whole family unit (not per
-- estate). Mail is uploaded here, AI suggests which estate it belongs to, the
-- executor approves, and it's filed under the correct estate. Rows live until
-- routed or dismissed.

create table if not exists family_mail (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid,
  uploader_name text,
  file_path text not null,            -- path in the estate-documents bucket (stays put once routed)
  original_name text,
  ai_name text,                       -- AI's suggested display name
  ai_doc_type text,                   -- AI's guess of what it is
  ai_summary text,
  suggested_estate_id uuid references estates(id) on delete set null,
  ai_confidence numeric,
  status text not null default 'pending',   -- pending | routed | dismissed
  routed_estate_id uuid references estates(id) on delete set null,
  routed_document_id uuid references estate_documents(id) on delete set null,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_family_mail_status on family_mail(status, created_at desc);

alter table family_mail enable row level security;

-- Who can use the family inbox: anyone who is an executor/collaborator on any
-- estate (the family unit). SECURITY DEFINER avoids RLS recursion on estate_users.
create or replace function is_family_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from estate_users
    where auth_user_id = auth.uid()
      and role in ('administrator','executor','collaborator')
  );
$$;

drop policy if exists "family_mail_access" on family_mail;
create policy "family_mail_access" on family_mail for all
  using (is_family_admin())
  with check (is_family_admin());
