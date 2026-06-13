-- Immutable activity/audit log. Every change to tasks, financials, documents,
-- notes, users, and estate stage is recorded by database triggers (so no app
-- path can skip it), with the acting user captured from auth.uid(). The table
-- has a SELECT policy only — no insert/update/delete policies — so the
-- SECURITY DEFINER trigger functions are the ONLY writers and history can never
-- be edited or deleted from the app. Append-only by construction.

create table if not exists estate_activity_log (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references estates(id) on delete cascade,
  actor_id uuid,                 -- auth.uid() at time of action (null = system/service)
  actor_name text,               -- snapshot of who acted (immutable)
  action text not null,          -- created | updated | status_changed | deleted | uploaded | renamed | added | removed | invited | joined | role_changed | stage_changed
  entity_type text not null,     -- task | financial | document | note | user | estate
  entity_id uuid,
  entity_label text,             -- human label snapshot (task text, doc name, etc.)
  detail text,                   -- e.g. "pending → done" (never dollar amounts or note content)
  is_private boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_activity_estate on estate_activity_log(estate_id, created_at desc);

alter table estate_activity_log enable row level security;

-- Read: executor sees everything; heir/observer/collaborator see non-private only.
drop policy if exists "activity_read" on estate_activity_log;
create policy "activity_read"
  on estate_activity_log for select
  using (
    get_estate_role(estate_id) = 'administrator'
    or (get_estate_role(estate_id) = any (array['heir','observer','collaborator']) and not is_private)
  );
-- (No insert/update/delete policies on purpose — only the triggers below write.)

-- Resolve the acting user's display name (snapshot), preferring their estate
-- membership name, then their auth email, else 'System'.
create or replace function log_activity(
  p_estate_id uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_entity_label text, p_detail text, p_is_private boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
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
end $$;

-- Tasks ---------------------------------------------------------------------
create or replace function trg_log_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (TG_OP = 'INSERT') then
    perform log_activity(NEW.estate_id, 'created', 'task', NEW.id, NEW.text, null, coalesce(NEW.is_private,false));
  elsif (TG_OP = 'UPDATE') then
    if NEW.status is distinct from OLD.status then
      perform log_activity(NEW.estate_id, 'status_changed', 'task', NEW.id, NEW.text,
        coalesce(OLD.status,'?')||' → '||coalesce(NEW.status,'?'), coalesce(NEW.is_private,false));
    end if;
  elsif (TG_OP = 'DELETE') then
    perform log_activity(OLD.estate_id, 'deleted', 'task', OLD.id, OLD.text, null, coalesce(OLD.is_private,false));
    return OLD;
  end if;
  return NEW;
end $$;

-- Financials (never log amounts; private unless a non-private asset) ---------
create or replace function trg_log_financial() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_priv boolean;
begin
  if (TG_OP = 'DELETE') then
    v_priv := coalesce(OLD.is_private,false) or coalesce(OLD.category,'') <> 'asset';
    perform log_activity(OLD.estate_id, 'removed', 'financial', OLD.id, OLD.name, initcap(coalesce(OLD.category,'')), v_priv);
    return OLD;
  end if;
  v_priv := coalesce(NEW.is_private,false) or coalesce(NEW.category,'') <> 'asset';
  if (TG_OP = 'INSERT') then
    perform log_activity(NEW.estate_id, 'added', 'financial', NEW.id, NEW.name, initcap(coalesce(NEW.category,'')), v_priv);
  elsif (TG_OP = 'UPDATE') then
    if NEW.status is distinct from OLD.status then
      perform log_activity(NEW.estate_id, 'status_changed', 'financial', NEW.id, NEW.name,
        coalesce(OLD.status,'?')||' → '||coalesce(NEW.status,'?'), v_priv);
    elsif (NEW.name is distinct from OLD.name) or (NEW.amount is distinct from OLD.amount) or (NEW.lender is distinct from OLD.lender) then
      perform log_activity(NEW.estate_id, 'updated', 'financial', NEW.id, NEW.name, null, v_priv);
    end if;
  end if;
  return NEW;
end $$;

-- Documents -----------------------------------------------------------------
create or replace function trg_log_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (TG_OP = 'INSERT') then
    perform log_activity(NEW.estate_id, 'added', 'document', NEW.id, NEW.name, null, coalesce(NEW.is_private,false));
  elsif (TG_OP = 'UPDATE') then
    if OLD.file_path is null and NEW.file_path is not null then
      perform log_activity(NEW.estate_id, 'uploaded', 'document', NEW.id, NEW.name, null, coalesce(NEW.is_private,false));
    elsif NEW.name is distinct from OLD.name then
      perform log_activity(NEW.estate_id, 'renamed', 'document', NEW.id, NEW.name,
        coalesce(OLD.name,'?')||' → '||coalesce(NEW.name,'?'), coalesce(NEW.is_private,false));
    end if;
  elsif (TG_OP = 'DELETE') then
    perform log_activity(OLD.estate_id, 'removed', 'document', OLD.id, OLD.name, null, coalesce(OLD.is_private,false));
    return OLD;
  end if;
  return NEW;
end $$;

-- Notes (log the date only, never the content) -------------------------------
create or replace function trg_log_note() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  if (TG_OP = 'DELETE') then
    v_label := 'Note for ' || to_char(OLD.note_date, 'Mon DD, YYYY');
    perform log_activity(OLD.estate_id, 'removed', 'note', OLD.id, v_label, null, coalesce(OLD.is_private,false));
    return OLD;
  end if;
  v_label := 'Note for ' || to_char(NEW.note_date, 'Mon DD, YYYY');
  if (TG_OP = 'INSERT') then
    perform log_activity(NEW.estate_id, 'added', 'note', NEW.id, v_label, null, coalesce(NEW.is_private,false));
  elsif (TG_OP = 'UPDATE') then
    if NEW.content is distinct from OLD.content then
      perform log_activity(NEW.estate_id, 'updated', 'note', NEW.id, v_label, null, coalesce(NEW.is_private,false));
    end if;
  end if;
  return NEW;
end $$;

-- Users / access ------------------------------------------------------------
create or replace function trg_log_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (TG_OP = 'INSERT') then
    perform log_activity(NEW.estate_id, 'invited', 'user', NEW.id, coalesce(NEW.name, NEW.email), NEW.role, false);
  elsif (TG_OP = 'UPDATE') then
    if (OLD.auth_user_id is null and NEW.auth_user_id is not null) then
      perform log_activity(NEW.estate_id, 'joined', 'user', NEW.id, coalesce(NEW.name, NEW.email), NEW.role, false);
    elsif NEW.role is distinct from OLD.role then
      perform log_activity(NEW.estate_id, 'role_changed', 'user', NEW.id, coalesce(NEW.name, NEW.email),
        coalesce(OLD.role,'?')||' → '||coalesce(NEW.role,'?'), false);
    end if;
  elsif (TG_OP = 'DELETE') then
    perform log_activity(OLD.estate_id, 'removed', 'user', OLD.id, coalesce(OLD.name, OLD.email), OLD.role, false);
    return OLD;
  end if;
  return NEW;
end $$;

-- Estate stage / status -----------------------------------------------------
create or replace function trg_log_estate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.status_stage is distinct from OLD.status_stage then
    perform log_activity(NEW.id, 'stage_changed', 'estate', NEW.id, NEW.name,
      coalesce(OLD.status_stage,'not set')||' → '||coalesce(NEW.status_stage,'not set'), false);
  end if;
  if NEW.status is distinct from OLD.status then
    perform log_activity(NEW.id, 'status_changed', 'estate', NEW.id, NEW.name,
      coalesce(OLD.status,'?')||' → '||coalesce(NEW.status,'?'), false);
  end if;
  return NEW;
end $$;

-- Wire up the triggers ------------------------------------------------------
drop trigger if exists log_task on estate_tasks;
create trigger log_task after insert or update or delete on estate_tasks for each row execute function trg_log_task();

drop trigger if exists log_financial on estate_financials;
create trigger log_financial after insert or update or delete on estate_financials for each row execute function trg_log_financial();

drop trigger if exists log_document on estate_documents;
create trigger log_document after insert or update or delete on estate_documents for each row execute function trg_log_document();

drop trigger if exists log_note on estate_daily_notes;
create trigger log_note after insert or update or delete on estate_daily_notes for each row execute function trg_log_note();

drop trigger if exists log_user on estate_users;
create trigger log_user after insert or update or delete on estate_users for each row execute function trg_log_user();

drop trigger if exists log_estate on estates;
create trigger log_estate after update on estates for each row execute function trg_log_estate();
