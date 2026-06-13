-- Executor-only vs shared daily notes.
alter table estate_daily_notes add column if not exists is_private boolean not null default false;

-- Enforce privacy at the row level: only the executor/administrator can read
-- private notes; everyone on the estate can still read shared notes.
drop policy if exists "Users can view notes for their estates" on estate_daily_notes;

create policy "view notes with private gated"
  on estate_daily_notes for select
  using (
    estate_id in (
      select estate_id from estate_users where auth_user_id = auth.uid()
    )
    and (
      is_private = false
      or get_estate_role(estate_id) in ('administrator', 'executor')
    )
  );
