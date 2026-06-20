-- Add a non-private communications feed to the heir transparency view: logged
-- interactions that are NOT executor-only, plus meetings. Body content is not
-- exposed beyond the short summary; executor-only items are excluded.
create or replace function public.estate_transparency(p_estate_id uuid)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare result json;
begin
  if not exists (
    select 1 from estate_users where estate_id = p_estate_id and auth_user_id = auth.uid()
  ) then
    raise exception 'not a member of this estate';
  end if;

  select json_build_object(
    'accounts_total',      coalesce((select sum(amount) from estate_financials where estate_id = p_estate_id and category = 'account'   and not is_private), 0),
    'assets_total',        coalesce((select sum(amount) from estate_financials where estate_id = p_estate_id and category = 'asset'     and not is_private and coalesce(status,'') not in ('sold','distributed')), 0),
    'liabilities_total',   coalesce((select sum(amount) from estate_financials where estate_id = p_estate_id and category = 'liability' and not is_private), 0),
    'monthly_obligations', coalesce((select sum(coalesce(amount, amount_max, amount_min, 0)) from estate_financials where estate_id = p_estate_id and category = 'obligation' and not is_private and status in ('active','unknown','cancel_on_vacate')), 0),
    'received',            coalesce((select sum(amount)      from estate_transactions where estate_id = p_estate_id and amount > 0), 0),
    'spent',               coalesce((select sum(abs(amount)) from estate_transactions where estate_id = p_estate_id and amount < 0), 0),
    'assets',              coalesce((select json_agg(json_build_object('name', name, 'status', status) order by name)
                                       from estate_financials where estate_id = p_estate_id and category = 'asset' and not is_private), '[]'::json),
    'communications',      coalesce((
                              select json_agg(row_to_json(c) order by c.occurred_at desc)
                              from (
                                select i.occurred_at, i.direction, i.channel, i.subject, i.summary, ct.name as contact_name
                                from estate_contact_interactions i
                                left join estate_contacts ct on ct.id = i.contact_id
                                where i.estate_id = p_estate_id and not i.is_private
                                union all
                                select m.scheduled_at as occurred_at, 'note' as direction, 'meeting' as channel,
                                       ('Meeting — ' || replace(coalesce(m.meeting_type, 'meeting'), '_', ' ')) as subject,
                                       coalesce(m.notes, '') as summary, m.contact_name
                                from estate_meetings m
                                where m.estate_id = p_estate_id
                                order by occurred_at desc
                                limit 100
                              ) c
                            ), '[]'::json)
  ) into result;

  return result;
end $function$;
