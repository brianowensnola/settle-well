-- Track when an SMS meeting reminder was sent (notify-sweep dedup).
alter table public.estate_meetings add column if not exists reminder_sent_at timestamptz;
