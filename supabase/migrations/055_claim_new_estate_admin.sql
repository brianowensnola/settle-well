-- Secure replacement for the client self-insert into estate_users. Lets the
-- creator of a brand-new estate (no members yet) become its administrator,
-- server-side. Prevents self-granting access to an estate that already has
-- members (privilege escalation). Paired with 056 (drops the self-insert policy).
create or replace function claim_new_estate_admin(p_estate_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := (auth.jwt() ->> 'email');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from estates where id = p_estate_id) then
    raise exception 'estate not found';
  end if;
  if exists (select 1 from estate_users where estate_id = p_estate_id) then
    raise exception 'estate already has members';
  end if;
  insert into estate_users (estate_id, auth_user_id, name, email, role)
  values (p_estate_id, auth.uid(),
          coalesce(nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Administrator'),
          v_email, 'administrator');
end $$;

grant execute on function claim_new_estate_admin(uuid) to authenticated;
