-- Store the counterpart email address on captured communications so the app can
-- offer a one-click Reply (works even when the sender isn't a saved contact).
alter table estate_contact_interactions add column if not exists from_email text;

-- Backfill existing inbound rows from the "From <addr>: ..." summary text.
update estate_contact_interactions
set from_email = substring(summary from 'From ([^ :]+@[^ :]+)')
where direction = 'inbound' and from_email is null and summary ~ 'From [^ :]+@';
