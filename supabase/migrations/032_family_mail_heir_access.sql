-- Let heirs use the Mail inbox (read + submit). Approving/dismissing stays with
-- executors/collaborators (is_family_admin). Observers excluded.
create or replace function can_use_mail() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from estate_users
    where auth_user_id = auth.uid()
      and role in ('administrator','executor','collaborator','heir')
  );
$$;

drop policy if exists "family_mail_access" on family_mail;
drop policy if exists "family_mail_read" on family_mail;
drop policy if exists "family_mail_insert" on family_mail;
drop policy if exists "family_mail_write" on family_mail;

create policy "family_mail_read" on family_mail for select using (can_use_mail());
create policy "family_mail_insert" on family_mail for insert with check (can_use_mail());
create policy "family_mail_update" on family_mail for update using (is_family_admin()) with check (is_family_admin());
create policy "family_mail_delete" on family_mail for delete using (is_family_admin());
