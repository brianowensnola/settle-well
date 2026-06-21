-- Archive an estate: keep all data but freeze it read-only (no edits, AI, or
-- communications) until reactivated. Estate matters can reopen years later, so
-- archiving is the preferred wind-down vs. hard deletion.
alter table estates add column if not exists archived boolean not null default false;
alter table estates add column if not exists archived_at timestamptz;
