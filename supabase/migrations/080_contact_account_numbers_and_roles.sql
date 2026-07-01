-- Account numbers on contacts (executor-only sensitive data).
alter table estate_contacts add column if not exists account_numbers text[] not null default '{}';

-- Manageable contact roles (add/remove in admin) instead of a hardcoded list.
create table if not exists public.contact_roles (
  key text primary key,
  label text not null,
  sort_order int not null default 500,
  created_at timestamptz not null default now()
);
alter table public.contact_roles enable row level security;

create policy contact_roles_select on public.contact_roles for select to authenticated using (true);
create policy contact_roles_write on public.contact_roles for all to authenticated
  using (exists (select 1 from estate_users eu where eu.auth_user_id = auth.uid() and eu.role in ('administrator','executor')))
  with check (exists (select 1 from estate_users eu where eu.auth_user_id = auth.uid() and eu.role in ('administrator','executor')));

insert into public.contact_roles (key, label, sort_order) values
  ('attorney','Attorney',10),
  ('bank','Bank',20),
  ('lender','Lender',30),
  ('insurance','Insurance Company',35),
  ('buyer','Buyer',40),
  ('funeral_home','Funeral Home',50),
  ('realtor','Realtor',60),
  ('appraiser','Appraiser',70),
  ('government','Government',80),
  ('medical','Medical',90),
  ('business','Business',100),
  ('executor','Executor',110),
  ('family','Family',120),
  ('other','Other',900)
on conflict (key) do nothing;
