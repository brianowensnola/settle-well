-- Enforce archived = read-only at the DB layer. INVOKER so current_user is the
-- caller's role: block authenticated/anon writes to an archived estate; server
-- (service_role) and SECURITY DEFINER functions (reactivate, delete-account)
-- pass through so they can still operate.
create or replace function public.block_writes_when_archived()
returns trigger language plpgsql set search_path to 'public' as $$
declare eid uuid; arch boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  eid := case when tg_op = 'DELETE' then old.estate_id else new.estate_id end;
  if eid is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select archived into arch from estates where id = eid;
  if coalesce(arch, false) then
    raise exception 'This estate is archived (read-only). Reactivate it in Estate Settings to make changes.'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
  tbls text[] := array[
    'attorney_document_sends','estate_ai_suggestions','estate_checklist_items',
    'estate_contact_interactions','estate_contacts','estate_credentials',
    'estate_credentials_log','estate_daily_notes','estate_document_extractions',
    'estate_documents','estate_financials','estate_heir_notice_log','estate_heir_todos',
    'estate_meetings','estate_messages','estate_sections','estate_task_documents',
    'estate_task_logs','estate_tasks','estate_transactions','estate_users'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_block_archived on public.%I', t);
    execute format('create trigger trg_block_archived before insert or update or delete on public.%I for each row execute function public.block_writes_when_archived()', t);
  end loop;
end $$;
