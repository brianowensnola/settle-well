-- Don't re-queue an estate that's being deleted (cascade fires this trigger on
-- child-row deletes before the transaction settles).
create or replace function mark_estate_dirty() returns trigger
language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  eid := coalesce(NEW.estate_id, OLD.estate_id);
  if eid is null then return null; end if;
  if not exists (select 1 from estates where id = eid) then return null; end if;
  insert into estate_ai_agent_state (estate_id, last_seen_change_at)
  values (eid, now())
  on conflict (estate_id) do update set last_seen_change_at = now();
  return null;
end;
$$;
