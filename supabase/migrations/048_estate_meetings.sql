-- Scheduled meetings with a contact, with AI-generated prep questions for
-- initial meetings, surfaced on the dashboard and tracked as a task.
create table if not exists estate_meetings (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references estates(id) on delete cascade,
  contact_id uuid references estate_contacts(id) on delete set null,
  contact_name text,
  meeting_type text not null default 'follow_up',  -- initial | follow_up | call | other
  scheduled_at timestamptz,
  status text not null default 'scheduled',         -- scheduled | completed | cancelled
  prep_questions jsonb not null default '[]'::jsonb, -- [{ "q": text, "checked": bool }]
  notes text,
  outcome text,
  linked_task_id uuid references estate_tasks(id) on delete set null,
  created_at timestamptz default now()
);

alter table estate_meetings enable row level security;

drop policy if exists "meetings_admin" on estate_meetings;
create policy "meetings_admin" on estate_meetings for all
  using (get_estate_role(estate_id) = 'administrator')
  with check (get_estate_role(estate_id) = 'administrator');
