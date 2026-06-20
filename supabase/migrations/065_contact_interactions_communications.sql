-- Richer communication capture: channel, subject, the date it actually happened,
-- and whether it was logged by hand or captured automatically by the app.
alter table estate_contact_interactions add column if not exists channel text;
alter table estate_contact_interactions add column if not exists subject text;
alter table estate_contact_interactions add column if not exists occurred_at timestamptz;
alter table estate_contact_interactions add column if not exists source text not null default 'manual';

-- Backfill the occurrence time for existing rows from when they were created.
update estate_contact_interactions set occurred_at = created_at where occurred_at is null;
alter table estate_contact_interactions alter column occurred_at set default now();

create index if not exists idx_eci_occurred_at on estate_contact_interactions (occurred_at);
