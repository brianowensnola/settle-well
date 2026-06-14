-- Mail workflow: richer fields for the scan → AI → executor-review pipeline.
alter table family_mail add column if not exists date_received date;
alter table family_mail add column if not exists sender text;
alter table family_mail add column if not exists is_bill boolean not null default false;
alter table family_mail add column if not exists bill_amount numeric;
alter table family_mail add column if not exists bill_due date;
alter table family_mail add column if not exists urgent boolean not null default false;
alter table family_mail add column if not exists ai_action text;
