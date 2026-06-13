-- Support document→task match suggestions: link a document to a task and
-- optionally update the task's status when accepted.
alter table estate_ai_suggestions add column if not exists link_task_id uuid references estate_tasks(id) on delete cascade;
alter table estate_ai_suggestions add column if not exists link_document_id uuid references estate_documents(id) on delete cascade;
alter table estate_ai_suggestions add column if not exists action text;  -- 'mark_done' | 'mark_in_progress' | 'link_only'
