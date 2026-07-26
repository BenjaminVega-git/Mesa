-- MÓDULO CONTABILIDAD (portal mesero): historial de pedidos tomados y de
-- TODAS las boletas emitidas por el sistema — a diferencia de
-- list_my_payments_today (acotada a hoy), estas no filtran por fecha; se
-- acotan con un límite razonable (100 filas más recientes) en vez de
-- paginación completa, consistente con el resto de los listados "recientes"
-- de MESA. Solo lectura: aquí no se cobra ni se abre/cierra turno.

create or replace function public.list_my_orders_history(p_limit integer default 100)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare s record; v jsonb; v_limit int;
begin
  select * into s from public._support_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 200);

  select coalesce(jsonb_agg(row_to_json(o) order by o.created_at desc), '[]'::jsonb) into v
  from (
    select
      o.id,
      t.table_number,
      o.total,
      o.tip_amount,
      o.status_id,
      st.status_name,
      o.created_at,
      u.user_name as paid_by_name,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'product_name', oi.product_name,
          'variant_name', oi.variant_name,
          'quantity', oi.product_quantity
        ) order by oi.id), '[]'::jsonb)
        from public.order_items oi
        where oi.order_id = o.id
      ) as items
    from public.orders o
    left join public.tables t on t.id = o.table_id
    left join public.order_status st on st.id = o.status_id
    left join public.users u on u.id = o.paid_by
    where o.restaurant_id = s.restaurant_id
    order by o.created_at desc
    limit v_limit
  ) o;

  return v;
end;
$$;

create or replace function public.list_my_payments_history(p_limit integer default 100)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare s record; v jsonb; v_limit int;
begin
  select * into s from public._support_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 200);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'table_number', t.table_number,
    'amount', p.amount,
    'tip', p.tip,
    'status', p.status,
    'method', p.method,
    'provider', p.provider,
    'created_at', p.created_at,
    'paid_at', p.paid_at,
    'boleta', (
      select jsonb_build_object('id', d.id, 'folio', d.folio, 'sii_status', d.sii_status)
      from public.tax_documents d
      where d.payment_id = p.id and d.doc_type in (39, 41) and not coalesce(d.voided, false)
      order by d.id desc limit 1
    )
  ) order by p.created_at desc), '[]'::jsonb) into v
  from (
    select * from public.payments
    where restaurant_id = s.restaurant_id
    order by created_at desc
    limit v_limit
  ) p
  left join public.tables t on t.id = p.table_id;

  return v;
end;
$$;

do $$
declare fn text;
begin
  for fn in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('list_my_orders_history', 'list_my_payments_history')
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;
