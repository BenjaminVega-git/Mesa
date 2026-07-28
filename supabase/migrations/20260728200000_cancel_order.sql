-- Botón "Cancelar pedido" en /admin/orders (pedidos creados por error), de
-- forma que no cuenten en los reportes de ventas. Los reportes (get_sales_report,
-- get_product_margins, get_peak_hours, get_my_organization_branches) filtran
-- SIEMPRE status_id = 4 (Pagado) — cualquier otro status_id, incluyendo este
-- nuevo "Cancelado", ya queda afuera sin tocar ninguna función de reporte.

insert into public.order_status (status_name)
select 'Cancelado'
where not exists (select 1 from public.order_status where status_name = 'Cancelado');

-- El descuento de stock por receta ya inserta 'venta' al crear el pedido
-- (motivo existente). Se agrega 'cancelacion' para la reversión — se revierte
-- reflejando EXACTAMENTE los movimientos reales de ese pedido (sumando los
-- 'venta' ya insertados), en vez de recalcular desde order_items/recetas —
-- eso evitaría duplicar la lógica de promociones/personalización de
-- ingredientes y el riesgo de que se desincronice con _process_order_items.
alter table public.stock_movements drop constraint if exists stock_movements_motivo_check;
alter table public.stock_movements
  add constraint stock_movements_motivo_check
  check (motivo in ('inicial','venta','reposicion','ajuste','conteo','merma','cancelacion'));

create or replace function public.cancel_order(p_order_id bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_rest    bigint;
  v_order_rest    bigint;
  v_status_id     int;
  v_cancelado_id  int;
  v_staff_id      bigint;
  v_reversed      int;
begin
  if not public.current_user_is_admin() then
    raise exception 'Solo el administrador puede cancelar pedidos';
  end if;

  v_admin_rest := public.current_user_restaurant_id();
  if v_admin_rest is null then
    raise exception 'No autorizado';
  end if;

  select restaurant_id, status_id into v_order_rest, v_status_id
  from public.orders
  where id = p_order_id
  for update;

  if v_order_rest is null then
    raise exception 'Pedido no encontrado';
  end if;
  if v_order_rest <> v_admin_rest then
    raise exception 'No autorizado';
  end if;

  select id into v_cancelado_id from public.order_status where status_name = 'Cancelado';

  if v_status_id = v_cancelado_id then
    raise exception 'El pedido ya está cancelado';
  end if;
  if v_status_id = 4 then
    raise exception 'No se puede cancelar un pedido ya pagado';
  end if;

  update public.orders set status_id = v_cancelado_id where id = p_order_id;

  v_staff_id := public._current_staff_id();

  -- Revierte exactamente lo que se descontó para este pedido (si tenía
  -- insumos con receta); si no consumió stock, no inserta nada.
  insert into public.stock_movements (restaurant_id, ingredient_id, delta, motivo, order_id, user_id, nota)
  select restaurant_id, ingredient_id, -delta, 'cancelacion', order_id, v_staff_id,
         left('Reversión por cancelación del pedido #' || p_order_id || coalesce(' — ' || p_reason, ''), 250)
  from public.stock_movements
  where order_id = p_order_id and motivo = 'venta';

  get diagnostics v_reversed = row_count;

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'status_id', v_cancelado_id,
    'stock_reversals', v_reversed
  );
end;
$$;

alter function public.cancel_order(bigint, text) owner to postgres;
revoke all on function public.cancel_order(bigint, text) from public, anon;
grant execute on function public.cancel_order(bigint, text) to authenticated, service_role;
