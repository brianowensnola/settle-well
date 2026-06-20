-- Full email/message body, and an executor-only flag so some communications can
-- be hidden from the heir transparency view.
alter table estate_contact_interactions add column if not exists body text;
alter table estate_contact_interactions add column if not exists is_private boolean not null default false;
