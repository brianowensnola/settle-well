-- AI advisor suggestions: reviewable proposals (general review + forensic
-- findings) that the executor accepts (→ becomes a task) or dismisses.
create table if not exists estate_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references estates(id) on delete cascade,
  kind text not null default 'review',            -- 'review' | 'forensic'
  title text not null,
  detail text,
  suggested_phase text,
  is_private boolean not null default false,
  status text not null default 'pending',          -- 'pending' | 'accepted' | 'dismissed'
  created_task_id uuid references estate_tasks(id) on delete set null,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_ai_suggestions_estate on estate_ai_suggestions(estate_id, status);

alter table estate_ai_suggestions enable row level security;

-- Suggestions (incl. forensic findings) are sensitive: executor only.
create policy "ai_suggestions_admin"
  on estate_ai_suggestions for all
  using (get_estate_role(estate_id) = 'administrator')
  with check (get_estate_role(estate_id) = 'administrator');
