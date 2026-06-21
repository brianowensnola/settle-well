-- Security hardening: pin search_path on these functions (advisor warning
-- function_search_path_mutable). Prevents search_path injection.
create or replace function public.derive_inbound_slug(p_name text, p_id uuid)
returns text language plpgsql set search_path to 'public' as $$
declare base text; candidate text; n int := 1;
begin
  base := lower(trim(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9 ]', '', 'g')));
  if base = '' then base := 'estate'; end if;
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

create or replace function public.set_inbound_token()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  NEW.inbound_token := public.derive_inbound_slug(NEW.deceased_name, NEW.id);
  return NEW;
end $$;
