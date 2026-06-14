-- Any estate member (heir/collaborator/observer) can READ the estate's contacts
-- (including contacts shared into their estate). Editing stays with the executor
-- (contacts_admin policy). SECURITY DEFINER helper avoids RLS recursion.
create or replace function can_see_contact(c_estate uuid, c_shared uuid[]) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from estate_users
    where auth_user_id = auth.uid()
      and (estate_id = c_estate or estate_id = any(coalesce(c_shared, '{}'::uuid[])))
  );
$$;

drop policy if exists "contacts_member_read" on estate_contacts;
create policy "contacts_member_read" on estate_contacts for select
  using (can_see_contact(estate_id, shared_with));
