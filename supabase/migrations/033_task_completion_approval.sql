-- Completion approval: a non-executor marking a task Done is converted to
-- "submitted" (awaiting executor approval), recording who submitted it.
alter table estate_tasks add column if not exists submitted_by uuid;
alter table estate_tasks add column if not exists submitted_at timestamptz;
alter table estate_tasks add column if not exists submitted_by_name text;

create or replace function trg_task_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if NEW.status = 'done' and OLD.status is distinct from 'done'
     and get_estate_role(NEW.estate_id) not in ('administrator','executor') then
    NEW.status := 'submitted';
  end if;
  if NEW.status = 'submitted' and OLD.status is distinct from 'submitted' then
    select name into v_name from estate_users where auth_user_id = auth.uid() and estate_id = NEW.estate_id limit 1;
    NEW.submitted_by := auth.uid();
    NEW.submitted_by_name := coalesce(v_name, 'a collaborator');
    NEW.submitted_at := now();
  end if;
  return NEW;
end $$;

drop trigger if exists task_approval on estate_tasks;
create trigger task_approval before update on estate_tasks for each row execute function trg_task_approval();
