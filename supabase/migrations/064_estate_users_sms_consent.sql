-- SMS opt-in consent on estate_users (toll-free compliance).
alter table public.estate_users add column if not exists sms_consent boolean not null default false;
alter table public.estate_users add column if not exists sms_consent_at timestamptz;
