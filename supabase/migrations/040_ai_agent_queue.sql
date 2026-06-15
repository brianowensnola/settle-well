-- Always-on AI agent (Phase 1, hybrid model): a per-estate work queue/watermark.
-- DB triggers mark an estate "dirty" when its reviewable data changes (enqueue);
-- a scheduled processor runs the review for dirty estates and stamps last_run_at.
create table if not exists estate_ai_agent_state (
  estate_id uuid primary key references estates(id) on delete cascade,
  enabled boolean not null default true,
  last_seen_change_at timestamptz default now(),
  last_run_at timestamptz
);

alter table estate_ai_agent_state enable row level security;

-- Executor can view / manage the agent state for their estate.
drop policy if exists "agent_state_admin" on estate_ai_agent_state;
create policy "agent_state_admin" on estate_ai_agent_state for all
  using (get_estate_role(estate_id) = 'administrator')
  with check (get_estate_role(estate_id) = 'administrator');

-- Mark an estate dirty whenever its reviewable data changes.
create or replace function mark_estate_dirty() returns trigger
language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  eid := coalesce(NEW.estate_id, OLD.estate_id);
  if eid is not null then
    insert into estate_ai_agent_state (estate_id, last_seen_change_at)
    values (eid, now())
    on conflict (estate_id) do update set last_seen_change_at = now();
  end if;
  return null;
end;
$$;

drop trigger if exists trg_dirty_tasks on estate_tasks;
create trigger trg_dirty_tasks after insert or update or delete on estate_tasks
  for each row execute function mark_estate_dirty();

drop trigger if exists trg_dirty_notes on estate_daily_notes;
create trigger trg_dirty_notes after insert or update or delete on estate_daily_notes
  for each row execute function mark_estate_dirty();

drop trigger if exists trg_dirty_docs on estate_documents;
create trigger trg_dirty_docs after insert or update or delete on estate_documents
  for each row execute function mark_estate_dirty();

drop trigger if exists trg_dirty_financials on estate_financials;
create trigger trg_dirty_financials after insert or update or delete on estate_financials
  for each row execute function mark_estate_dirty();
