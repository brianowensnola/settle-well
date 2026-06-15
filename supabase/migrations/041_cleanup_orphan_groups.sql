-- Ghost-data prevention: when an estate is deleted (or moved to a different
-- family), delete its old family group if no estates remain in it. All other
-- child rows already cascade-delete via estate_id FKs.
create or replace function cleanup_orphan_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if OLD.group_id is not null
     and not exists (select 1 from estates where group_id = OLD.group_id) then
    delete from estate_groups where id = OLD.group_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_cleanup_group_on_estate_delete on estates;
create trigger trg_cleanup_group_on_estate_delete
  after delete on estates
  for each row execute function cleanup_orphan_group();

drop trigger if exists trg_cleanup_group_on_estate_regroup on estates;
create trigger trg_cleanup_group_on_estate_regroup
  after update of group_id on estates
  for each row when (OLD.group_id is distinct from NEW.group_id)
  execute function cleanup_orphan_group();
