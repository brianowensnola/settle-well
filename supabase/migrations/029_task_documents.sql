-- Many-to-many: a document can be referenced from several tasks at once.
-- (The existing estate_documents.linked_task_id stays for auto-links like mail
-- routing / AI doc-match; the task page shows the union of both.)
create table if not exists estate_task_documents (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references estates(id) on delete cascade,
  task_id uuid not null references estate_tasks(id) on delete cascade,
  document_id uuid not null references estate_documents(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  unique (task_id, document_id)
);

create index if not exists idx_task_documents_task on estate_task_documents(task_id);
create index if not exists idx_task_documents_doc on estate_task_documents(document_id);

alter table estate_task_documents enable row level security;

-- Members can see links; executor + collaborator can create/remove them.
drop policy if exists "task_documents_read" on estate_task_documents;
create policy "task_documents_read" on estate_task_documents for select
  using (get_estate_role(estate_id) = any (array['administrator','collaborator','heir','observer']));

drop policy if exists "task_documents_write" on estate_task_documents;
create policy "task_documents_write" on estate_task_documents for all
  using (get_estate_role(estate_id) = any (array['administrator','collaborator']))
  with check (get_estate_role(estate_id) = any (array['administrator','collaborator']));
