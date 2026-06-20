-- Make estate inbound addresses human-readable (first-last slug) instead of a
-- random hex token, so they look professional and less like spam. The address
-- is just the inbound_token value, so nicer value = nicer address everywhere.

create or replace function public.derive_inbound_slug(p_name text, p_id uuid)
returns text language plpgsql as $$
declare base text; candidate text; n int := 1;
begin
  base := lower(trim(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9 ]', '', 'g')));
  if base = '' then base := 'estate'; end if;
  -- collapse to first word + last word (e.g. "Daniel Wayne Bryant" -> daniel-bryant)
  if position(' ' in base) > 0 then
    base := split_part(base, ' ', 1) || '-' || regexp_replace(base, '^.* ', '');
  end if;
  base := regexp_replace(base, '\s+', '-', 'g');
  candidate := base;
  while exists (select 1 from estates where inbound_token = candidate and (p_id is null or id <> p_id)) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end $$;

-- New estates get a readable token automatically (overrides the random default).
create or replace function public.set_inbound_token()
returns trigger language plpgsql as $$
begin
  NEW.inbound_token := public.derive_inbound_slug(NEW.deceased_name, NEW.id);
  return NEW;
end $$;

drop trigger if exists trg_set_inbound_token on public.estates;
create trigger trg_set_inbound_token before insert on public.estates
  for each row execute function public.set_inbound_token();

-- Backfill existing estates (replaces their random tokens).
do $$
declare r record;
begin
  for r in select id, deceased_name from estates order by created_at loop
    update estates set inbound_token = public.derive_inbound_slug(r.deceased_name, r.id) where id = r.id;
  end loop;
end $$;
