-- Heir/observer fiduciary transparency: executor-set estate stage + a safe
-- accounting summary that never exposes account numbers, notes, or private rows.
alter table estates add column if not exists status_stage text;

create or replace function estate_transparency(p_estate_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare result json;
begin
  if not exists (
    select 1 from estate_users where estate_id = p_estate_id and auth_user_id = auth.uid()
  ) then
    raise exception 'not a member of this estate';
  end if;

  select json_build_object(
    'accounts_total',      coalesce((select sum(amount) from estate_financials where estate_id = p_estate_id and category = 'account'   and not is_private), 0),
    'assets_total',        coalesce((select sum(amount) from estate_financials where estate_id = p_estate_id and category = 'asset'     and not is_private), 0),
    'liabilities_total',   coalesce((select sum(amount) from estate_financials where estate_id = p_estate_id and category = 'liability' and not is_private), 0),
    'monthly_obligations', coalesce((select sum(coalesce(amount, amount_max, amount_min, 0)) from estate_financials where estate_id = p_estate_id and category = 'obligation' and not is_private), 0),
    'received',            coalesce((select sum(amount)      from estate_transactions where estate_id = p_estate_id and amount > 0), 0),
    'spent',               coalesce((select sum(abs(amount)) from estate_transactions where estate_id = p_estate_id and amount < 0), 0),
    'assets',              coalesce((select json_agg(json_build_object('name', name, 'status', status) order by name)
                                       from estate_financials where estate_id = p_estate_id and category = 'asset' and not is_private), '[]'::json)
  ) into result;

  return result;
end $$;
