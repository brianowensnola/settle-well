-- Create daily notes table for documenting events and decisions
create table estate_daily_notes (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references estates(id) on delete cascade,
  note_date date not null,
  content text not null,
  tags text[] default array[]::text[],
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by uuid references auth.users(id)
);

create index idx_daily_notes_estate_date on estate_daily_notes(estate_id, note_date desc);
create index idx_daily_notes_estate_id on estate_daily_notes(estate_id);

alter table estate_daily_notes enable row level security;

create policy "Users can view notes for their estates"
  on estate_daily_notes for select
  using (
    estate_id in (
      select estate_id from estate_users
      where auth_user_id = auth.uid()
    )
  );

create policy "Users can create notes for their estates"
  on estate_daily_notes for insert
  with check (
    estate_id in (
      select estate_id from estate_users
      where auth_user_id = auth.uid()
    ) and
    created_by = auth.uid()
  );

create policy "Users can update their own notes"
  on estate_daily_notes for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
