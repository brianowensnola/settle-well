-- Capture full demographics for everyone with estate access (executor, heir,
-- observer, etc.) and allow adding a person before their email is known.
alter table estate_users add column if not exists phone text;
alter table estate_users add column if not exists address text;
alter table estate_users add column if not exists relationship text;
alter table estate_users alter column email drop not null;
