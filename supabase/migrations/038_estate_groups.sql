-- A "family estate" groups several related individual estates (e.g. Dan + Traci
-- Bryant) so their finances can roll up together. Unrelated estates have no
-- group and never roll up with each other.
create table if not exists estate_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

alter table estates add column if not exists group_id uuid references estate_groups(id) on delete set null;

alter table estate_groups enable row level security;

-- Membership check that bypasses RLS recursion (same pattern as can_see_contact).
create or replace function user_in_group(g uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from estates e
    join estate_users eu on eu.estate_id = e.id
    where e.group_id = g and eu.auth_user_id = auth.uid()
  );
$$;

drop policy if exists "groups_insert" on estate_groups;
create policy "groups_insert" on estate_groups for insert
  with check (auth.uid() is not null);

-- You can see a group you created (covers the just-created, no-members-yet case)
-- or any group one of your estates belongs to.
drop policy if exists "groups_select" on estate_groups;
create policy "groups_select" on estate_groups for select
  using (created_by = auth.uid() or user_in_group(id));

drop policy if exists "groups_update" on estate_groups;
create policy "groups_update" on estate_groups for update
  using (created_by = auth.uid() or user_in_group(id))
  with check (created_by = auth.uid() or user_in_group(id));
