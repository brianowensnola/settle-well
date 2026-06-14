-- Shared contacts across estates: a contact lives in its home estate (estate_id)
-- and can additionally appear in other estates listed in shared_with. One
-- record, edited once, visible everywhere it's shared — no duplicates.
alter table estate_contacts add column if not exists shared_with uuid[] not null default '{}';

-- Helps the "show in this estate too" lookups.
create index if not exists idx_contacts_shared_with on estate_contacts using gin (shared_with);
