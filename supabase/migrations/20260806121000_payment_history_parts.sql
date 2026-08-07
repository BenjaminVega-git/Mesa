-- Expone el desglose también en Contabilidad, no solo en Pagos de hoy.
create or replace function public.list_my_payments_history(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare s record; v jsonb; v_limit int;
begin
  select * into s from public._support_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 200);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'table_number', t.table_number, 'amount', p.amount, 'tip', p.tip,
    'status', p.status, 'method', p.method, 'provider', p.provider,
    'parts', public._payment_parts_json(p.id), 'created_at', p.created_at, 'paid_at', p.paid_at,
    'boleta', (select jsonb_build_object('id', d.id, 'folio', d.folio, 'sii_status', d.sii_status)
      from public.tax_documents d where d.payment_id = p.id and d.doc_type in (39, 41) and not coalesce(d.voided, false)
      order by d.id desc limit 1)
  ) order by p.created_at desc), '[]'::jsonb) into v
  from (select * from public.payments where restaurant_id = s.restaurant_id order by created_at desc limit v_limit) p
  left join public.tables t on t.id = p.table_id;
  return v;
end;
$$;
revoke all on function public.list_my_payments_history(integer) from public, anon;
grant execute on function public.list_my_payments_history(integer) to authenticated, service_role;
