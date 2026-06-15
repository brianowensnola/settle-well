-- Shared / joint financial items: recorded once under a home estate, also
-- surfaced in (and readable by the executor of) the other family estate(s).
alter table estate_financials add column if not exists shared_with uuid[] default '{}'::uuid[];

-- True if the current user is an executor/administrator of any of the given estates.
create or replace function user_admins_any(estate_ids uuid[]) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from estate_users
    where auth_user_id = auth.uid()
      and role in ('administrator', 'executor')
      and estate_id = any(coalesce(estate_ids, '{}'::uuid[]))
  );
$$;

-- An executor of an estate the item is shared into can read it (the home-estate
-- executor is already covered by financials_admin).
drop policy if exists "financials_shared_read" on estate_financials;
create policy "financials_shared_read" on estate_financials for select
  using (user_admins_any(shared_with));
