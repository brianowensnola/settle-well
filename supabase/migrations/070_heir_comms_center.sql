-- Heir Communications Center: (1) a proof log of notices/updates SENT to heirs,
-- and (2) in-app messaging between the executor and heirs.

-- 1) Proof log: each row is one update/notice the executor sent to heirs.
create table if not exists public.estate_heir_notice_log (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates(id) on delete cascade,
  notice_type text not null default 'progress_update',
  title text,
  body text,
  channels text[] not null default '{email}',
  recipients jsonb not null default '[]'::jsonb,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_heir_notice_estate on public.estate_heir_notice_log(estate_id, sent_at desc);
alter table public.estate_heir_notice_log enable row level security;

create policy heir_notice_select on public.estate_heir_notice_log
  for select using (exists (
    select 1 from public.estate_users eu
    where eu.estate_id = estate_heir_notice_log.estate_id and eu.auth_user_id = auth.uid()));
create policy heir_notice_insert on public.estate_heir_notice_log
  for insert with check (exists (
    select 1 from public.estate_users eu
    where eu.estate_id = estate_heir_notice_log.estate_id and eu.auth_user_id = auth.uid()
      and eu.role in ('administrator','executor')));
create policy heir_notice_delete on public.estate_heir_notice_log
  for delete using (exists (
    select 1 from public.estate_users eu
    where eu.estate_id = estate_heir_notice_log.estate_id and eu.auth_user_id = auth.uid()
      and eu.role in ('administrator','executor')));

-- 2) In-app messaging (heir <-> executor Q&A). is_private = executor-only note.
create table if not exists public.estate_messages (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates(id) on delete cascade,
  author_user_id uuid not null default auth.uid(),
  author_name text,
  author_role text,
  body text not null,
  parent_id uuid references public.estate_messages(id) on delete cascade,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_estate_messages on public.estate_messages(estate_id, created_at);
alter table public.estate_messages enable row level security;

create policy estate_messages_select on public.estate_messages
  for select using (exists (
    select 1 from public.estate_users eu
    where eu.estate_id = estate_messages.estate_id and eu.auth_user_id = auth.uid()
      and (not estate_messages.is_private or eu.role in ('administrator','executor'))));
create policy estate_messages_insert on public.estate_messages
  for insert with check (author_user_id = auth.uid() and exists (
    select 1 from public.estate_users eu
    where eu.estate_id = estate_messages.estate_id and eu.auth_user_id = auth.uid()));
create policy estate_messages_delete on public.estate_messages
  for delete using (author_user_id = auth.uid() or exists (
    select 1 from public.estate_users eu
    where eu.estate_id = estate_messages.estate_id and eu.auth_user_id = auth.uid()
      and eu.role in ('administrator','executor')));
