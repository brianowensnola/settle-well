-- Access-person -> contact trigger now assigns contact role 'executor' for
-- administrators/executors; everyone else stays 'family'. ('executor' was added
-- to CONTACT_ROLES in the app.) Pairs with 051/052.
create or replace function sync_user_to_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare contact_role text;
begin
  if new.estate_id is null then return new; end if;

  if new.email is not null and new.email <> '' and exists (
    select 1 from estate_contacts
    where estate_id = new.estate_id and lower(email) = lower(new.email)
  ) then
    return new;
  end if;

  if (new.email is null or new.email = '') and exists (
    select 1 from estate_contacts
    where estate_id = new.estate_id and lower(name) = lower(coalesce(new.name, ''))
  ) then
    return new;
  end if;

  contact_role := case when new.role in ('administrator', 'executor') then 'executor' else 'family' end;

  insert into estate_contacts (estate_id, name, email, phone, role, notes)
  values (
    new.estate_id,
    coalesce(nullif(new.name, ''), split_part(coalesce(new.email, ''), '@', 1), 'App user'),
    coalesce(new.email, ''),
    coalesce(new.phone, ''),
    contact_role,
    'Has access to this estate (app user).'
  );
  return new;
end $$;

-- One-time backfill: existing executor/administrator app-user contacts -> 'executor':
-- update estate_contacts c set role = 'executor'
-- from estate_users eu
-- where eu.estate_id = c.estate_id and lower(eu.email) = lower(c.email)
--   and eu.role in ('administrator','executor')
--   and c.notes = 'Has access to this estate (app user).' and c.role <> 'executor';
