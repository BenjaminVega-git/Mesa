-- Anulacion de ventas cobradas desde "Pagos de hoy".
-- Esta RPC cambia ventas pagadas a refunded, cancela sus pedidos,
-- anula boletas asociadas y revierte stock.

insert into public.order_status (status_name)
select 'Cancelado'
where not exists (select 1 from public.order_status where status_name = 'Cancelado');

create or replace function public.annul_staff_payment(
  p_payment_id bigint,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid bigint;
  v_payment public.payments;
  v_cancelado_id int;
  v_order_ids bigint[];
  v_cancelled_orders int := 0;
  v_voided_docs int := 0;
  v_reversed int := 0;
  v_staff_id bigint;
begin
  if not public.current_user_is_admin() then
    raise exception 'Solo el administrador puede anular ventas';
  end if;

  v_rid := public.current_user_restaurant_id();
  if v_rid is null then
    raise exception 'No autorizado';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id and restaurant_id = v_rid
  for update;

  if v_payment.id is null then
    raise exception 'Venta no encontrada';
  end if;
  if v_payment.status = 'refunded' then
    raise exception 'La venta ya esta anulada';
  end if;
  if v_payment.status <> 'paid' then
    raise exception 'Solo se pueden anular ventas pagadas';
  end if;

  select id into v_cancelado_id
  from public.order_status
  where status_name = 'Cancelado'
  limit 1;

  if v_cancelado_id is null then
    raise exception 'No existe el estado Cancelado';
  end if;

  select coalesce(array_agg(id), '{}'::bigint[]) into v_order_ids
  from public.orders
  where payment_id = p_payment_id
    and restaurant_id = v_rid
    and status_id = 4;

  v_staff_id := public._current_staff_id();

  insert into public.stock_movements (restaurant_id, ingredient_id, delta, motivo, order_id, user_id, nota)
  select sm.restaurant_id, sm.ingredient_id, -sm.delta, 'cancelacion', sm.order_id, v_staff_id,
         left('Reversion por anulacion de venta #' || p_payment_id || coalesce(' - ' || p_reason, ''), 250)
  from public.stock_movements sm
  where sm.order_id = any(v_order_ids)
    and sm.motivo = 'venta';

  get diagnostics v_reversed = row_count;

  update public.orders
  set status_id = v_cancelado_id,
      tip_amount = 0
  where id = any(v_order_ids);

  get diagnostics v_cancelled_orders = row_count;

  update public.tax_documents
  set voided = true
  where payment_id = p_payment_id
    and restaurant_id = v_rid
    and doc_type in (39, 41)
    and not coalesce(voided, false);

  get diagnostics v_voided_docs = row_count;

  update public.payments
  set status = 'refunded'
  where id = p_payment_id
    and restaurant_id = v_rid;

  return jsonb_build_object(
    'ok', true,
    'payment_id', p_payment_id,
    'cancelled_orders', v_cancelled_orders,
    'voided_documents', v_voided_docs,
    'stock_reversals', v_reversed
  );
end;
$$;

alter function public.annul_staff_payment(bigint, text) owner to postgres;
revoke all on function public.annul_staff_payment(bigint, text) from public, anon;
grant execute on function public.annul_staff_payment(bigint, text) to authenticated, service_role;
