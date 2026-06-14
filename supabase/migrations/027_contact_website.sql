-- Contacts can have a website / web address.
alter table estate_contacts add column if not exists website text;
