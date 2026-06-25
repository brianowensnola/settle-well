-- Track whether an auto-captured inbound communication (email/text) has been
-- reviewed, so new ones can be highlighted until the executor sees them.
alter table estate_contact_interactions add column if not exists reviewed_at timestamptz;
