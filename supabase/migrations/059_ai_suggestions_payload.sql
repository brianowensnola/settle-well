-- Structured data for actionable AI suggestions (task-audit merge/group):
--   merge -> {keep_id, remove_ids[]}   group -> {parent_id, child_ids[]}
alter table public.estate_ai_suggestions add column if not exists payload jsonb;
