-- Anyone with access to an estate (a row in estate_users) should also appear in
-- that estate's Contacts. This trigger creates a matching contact on insert,
-- skipping duplicates (by email, or by name when there's no email). Role is set
-- to 'family' (closest contact role for an access-person); editable afterward.
create or replace function sync_user_to_contact() returns trigger
language plpgsql security definer set search_path = public as $$
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

  insert into estate_contacts (estate_id, name, email, phone, role, notes)
  values (
    new.estate_id,
    coalesce(nullif(new.name, ''), split_part(coalesce(new.email, ''), '@', 1), 'App user'),
    coalesce(new.email, ''),
    coalesce(new.phone, ''),
    'family',
    'Has access to this estate (app user).'
  );
  return new;
end $$;

drop trigger if exists trg_user_to_contact on estate_users;
create trigger trg_user_to_contact after insert on estate_users
  for each row execute function sync_user_to_contact();

-- One-time backfill for everyone who already had a role when this shipped:
-- insert into estate_contacts (estate_id, name, email, phone, role, notes)
-- select eu.estate_id,
--        coalesce(nullif(eu.name, ''), split_part(coalesce(eu.email, ''), '@', 1), 'App user'),
--        coalesce(eu.email, ''), coalesce(eu.phone, ''), 'family',
--        'Has access to this estate (app user).'
-- from estate_users eu
-- where eu.estate_id is not null
--   and not exists (
--     select 1 from estate_contacts c
--     where c.estate_id = eu.estate_id
--       and ((eu.email <> '' and lower(c.email) = lower(eu.email))
--            or ((eu.email is null or eu.email = '') and lower(c.name) = lower(coalesce(eu.name, '')))));
