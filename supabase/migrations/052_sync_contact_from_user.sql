-- When an access-person's details change (estate_users update), keep their
-- auto-created contact in sync — name/email/phone only. Never touches the
-- contact's role, company, notes, or address (those may be customized).
-- Pairs with 051_user_to_contact.sql (create-on-insert).
create or replace function sync_contact_from_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estate_id is null then return new; end if;

  if coalesce(new.name, '')  is not distinct from coalesce(old.name, '')
     and coalesce(new.email, '') is not distinct from coalesce(old.email, '')
     and coalesce(new.phone, '') is not distinct from coalesce(old.phone, '') then
    return new;
  end if;

  update estate_contacts
  set name  = coalesce(nullif(new.name, ''), name),
      email = coalesce(nullif(new.email, ''), email),
      phone = coalesce(new.phone, phone),
      updated_at = now()
  where estate_id = new.estate_id
    and (
      (old.email is not null and old.email <> '' and lower(email) = lower(old.email))
      or ((old.email is null or old.email = '') and lower(name) = lower(coalesce(old.name, '')))
    );
  return new;
end $$;

drop trigger if exists trg_contact_from_user on estate_users;
create trigger trg_contact_from_user after update on estate_users
  for each row execute function sync_contact_from_user();
