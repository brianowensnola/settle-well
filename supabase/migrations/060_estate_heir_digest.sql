-- Latest AI-written heir progress update (executor-generated, non-private only).
alter table public.estates add column if not exists heir_digest text;
alter table public.estates add column if not exists heir_digest_at timestamptz;
