-- Create estate checklist items table
create table estate_checklist_items (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references estates(id) on delete cascade,
  category text not null,
  item text not null,
  completed boolean default false,
  completed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index idx_estate_checklist_estate_id on estate_checklist_items(estate_id);
create index idx_estate_checklist_category on estate_checklist_items(category);

alter table estate_checklist_items enable row level security;

create policy "Users can view checklist for their estates"
  on estate_checklist_items for select
  using (
    estate_id in (
      select estate_id from estate_users
      where auth_user_id = auth.uid()
    )
  );

create policy "Users can update checklist for their estates"
  on estate_checklist_items for update
  using (
    estate_id in (
      select estate_id from estate_users
      where auth_user_id = auth.uid()
    )
  )
  with check (
    estate_id in (
      select estate_id from estate_users
      where auth_user_id = auth.uid()
    )
  );

create policy "Users can insert checklist items for their estates"
  on estate_checklist_items for insert
  with check (
    estate_id in (
      select estate_id from estate_users
      where auth_user_id = auth.uid()
    )
  );
