-- During an estate delete, child rows cascade and their logging triggers fire,
-- trying to write an activity-log row for an estate that no longer exists (FK
-- violation). Skip logging when the estate is gone.
create or replace function public.log_activity(
  p_estate_id uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_entity_label text, p_detail text, p_is_private boolean)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_name text;
begin
  -- Estate is being deleted (or doesn't exist) — nothing to log against.
  if not exists (select 1 from estates where id = p_estate_id) then
    return;
  end if;
  select name into v_name from estate_users
    where estate_id = p_estate_id and auth_user_id = auth.uid() limit 1;
  if v_name is null or v_name = '' then
    select email into v_name from auth.users where id = auth.uid();
  end if;
  insert into estate_activity_log
    (estate_id, actor_id, actor_name, action, entity_type, entity_id, entity_label, detail, is_private)
  values
    (p_estate_id, auth.uid(), coalesce(v_name, 'System'), p_action, p_entity_type,
     p_entity_id, p_entity_label, p_detail, coalesce(p_is_private, false));
end $function$;
