-- Track document sends to attorney to prevent duplicate submissions
create table attorney_document_sends (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references estates(id) on delete cascade,
  document_ids uuid[] not null,
  document_count integer not null,
  document_names text,
  sent_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);

create index idx_attorney_document_sends_estate_id on attorney_document_sends(estate_id);
create index idx_attorney_document_sends_sent_at on attorney_document_sends(sent_at desc);

alter table attorney_document_sends enable row level security;

create policy "Users can view sends for their estates"
  on attorney_document_sends for select
  using (
    estate_id in (
      select id from estates
      where id in (
        select estate_id from estate_users
        where auth_user_id = auth.uid()
      )
    )
  );

create policy "Users can insert sends for their estates"
  on attorney_document_sends for insert
  with check (
    estate_id in (
      select id from estates
      where id in (
        select estate_id from estate_users
        where auth_user_id = auth.uid()
      )
    )
  );
