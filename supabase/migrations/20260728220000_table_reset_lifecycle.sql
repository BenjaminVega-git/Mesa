-- Reset consistente de mesa.
--
-- Una mesa queda realmente libre cuando ya no tiene pedidos activos: se libera
-- el mesero asignado, se limpian comensales/carrito compartido y se atienden
-- llamadas pendientes. El admin tambien puede forzar este reset; en ese caso
-- los pedidos activos se cancelan y el stock descontado se revierte.

create or replace function public._reset_table_state(p_table_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cart_deleted int := 0;
  v_diners_deleted int := 0;
  v_calls_attended int := 0;
  v_staff_id bigint;
begin
  begin
    v_staff_id := public._current_staff_id();
  exception when others then
    v_staff_id := null;
  end;

  delete from public.table_cart_items where table_id = p_table_id;
  get diagnostics v_cart_deleted = row_count;

  delete from public.table_diners where table_id = p_table_id;
  get diagnostics v_diners_deleted = row_count;

  update public.service_calls
     set status = 'attended',
         attended_at = coalesce(attended_at, now()),
         attended_by = coalesce(attended_by, v_staff_id)
   where table_id = p_table_id
     and status = 'pending';
  get diagnostics v_calls_attended = row_count;

  update public.tables
     set current_waiter_id = null
   where id = p_table_id;

  return jsonb_build_object(
    'cart_deleted', v_cart_deleted,
    'diners_deleted', v_diners_deleted,
    'calls_attended', v_calls_attended
  );
end;
$$;

revoke all on function public._reset_table_state(bigint) from public, anon, authenticated;
grant execute on function public._reset_table_state(bigint) to service_role;

create or replace function public.admin_reset_table(
  p_table_id bigint,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_admin_rest bigint;
  v_table_rest bigint;
  v_cancelado_id int;
  v_staff_id bigint;
  v_canceled_ids bigint[];
  v_reversed int := 0;
  v_reset jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'Solo el administrador puede resetear mesas';
  end if;

  v_admin_rest := public.current_user_restaurant_id();
  if v_admin_rest is null then
    raise exception 'No autorizado';
  end if;

  select restaurant_id into v_table_rest
  from public.tables
  where id = p_table_id
  for update;

  if v_table_rest is null then
    raise exception 'Mesa no encontrada';
  end if;
  if v_table_rest <> v_admin_rest then
    raise exception 'No autorizado';
  end if;

  insert into public.order_status (status_name)
  select 'Cancelado'
  where not exists (select 1 from public.order_status where status_name = 'Cancelado');

  select id into v_cancelado_id
  from public.order_status
  where status_name = 'Cancelado';

  select coalesce(array_agg(o.id order by o.id), array[]::bigint[]) into v_canceled_ids
  from (
    select id
    from public.orders
    where table_id = p_table_id
      and restaurant_id = v_admin_rest
      and status_id in (1, 2, 3)
    for update
  ) o;

  update public.orders
     set status_id = v_cancelado_id
   where id = any(v_canceled_ids);

  v_staff_id := public._current_staff_id();

  insert into public.stock_movements (restaurant_id, ingredient_id, delta, motivo, order_id, user_id, nota)
  select restaurant_id, ingredient_id, -delta, 'cancelacion', order_id, v_staff_id,
         left('Reset de mesa #' || p_table_id || coalesce(' - ' || p_reason, ''), 250)
  from public.stock_movements
  where order_id = any(v_canceled_ids) and motivo = 'venta';
  get diagnostics v_reversed = row_count;

  v_reset := public._reset_table_state(p_table_id);

  return jsonb_build_object(
    'ok', true,
    'table_id', p_table_id,
    'canceled_ids', to_jsonb(v_canceled_ids),
    'stock_reversals', v_reversed,
    'reset', v_reset
  );
end;
$$;

revoke all on function public.admin_reset_table(bigint, text) from public, anon;
grant execute on function public.admin_reset_table(bigint, text) to authenticated, service_role;

create or replace function public.cancel_order(p_order_id bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_rest    bigint;
  v_order_rest    bigint;
  v_table_id      bigint;
  v_status_id     int;
  v_cancelado_id  int;
  v_staff_id      bigint;
  v_reversed      int;
  v_remaining     int;
  v_released      boolean := false;
begin
  if not public.current_user_is_admin() then
    raise exception 'Solo el administrador puede cancelar pedidos';
  end if;

  v_admin_rest := public.current_user_restaurant_id();
  if v_admin_rest is null then
    raise exception 'No autorizado';
  end if;

  select restaurant_id, table_id, status_id into v_order_rest, v_table_id, v_status_id
  from public.orders
  where id = p_order_id
  for update;

  if v_order_rest is null then
    raise exception 'Pedido no encontrado';
  end if;
  if v_order_rest <> v_admin_rest then
    raise exception 'No autorizado';
  end if;

  insert into public.order_status (status_name)
  select 'Cancelado'
  where not exists (select 1 from public.order_status where status_name = 'Cancelado');

  select id into v_cancelado_id from public.order_status where status_name = 'Cancelado';

  if v_status_id = v_cancelado_id then
    raise exception 'El pedido ya esta cancelado';
  end if;
  if v_status_id = 4 then
    raise exception 'No se puede cancelar un pedido ya pagado';
  end if;

  update public.orders set status_id = v_cancelado_id where id = p_order_id;

  v_staff_id := public._current_staff_id();

  insert into public.stock_movements (restaurant_id, ingredient_id, delta, motivo, order_id, user_id, nota)
  select restaurant_id, ingredient_id, -delta, 'cancelacion', order_id, v_staff_id,
         left('Reversion por cancelacion del pedido #' || p_order_id || coalesce(' - ' || p_reason, ''), 250)
  from public.stock_movements
  where order_id = p_order_id and motivo = 'venta';
  get diagnostics v_reversed = row_count;

  if v_table_id is not null then
    select count(*) into v_remaining
    from public.orders
    where table_id = v_table_id and status_id in (1, 2, 3);

    if v_remaining = 0 then
      perform public._reset_table_state(v_table_id);
      v_released := true;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'status_id', v_cancelado_id,
    'stock_reversals', v_reversed,
    'table_released', v_released
  );
end;
$$;

alter function public.cancel_order(bigint, text) owner to postgres;
revoke all on function public.cancel_order(bigint, text) from public, anon;
grant execute on function public.cancel_order(bigint, text) to authenticated, service_role;

create or replace function public.staff_register_payment(
  p_table_id bigint,
  p_method text,
  p_tip integer default 0,
  p_diner_slot integer default null,
  p_order_id bigint default null,
  p_order_ids bigint[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s record;
  v_table record;
  v_ids bigint[];
  v_amount integer;
  v_max_id bigint;
  v_tip integer;
  v_pid bigint;
  v_remaining int;
  v_released boolean := false;
begin
  select * into s from public._charge_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;
  if p_method not in ('cash', 'card') then raise exception 'Metodo de pago invalido'; end if;

  v_tip := greatest(0, coalesce(p_tip, 0));
  if v_tip > 1000000 then raise exception 'Propina fuera de rango'; end if;

  select id, restaurant_id, table_number into v_table
  from public.tables where id = p_table_id;
  if v_table.id is null or v_table.restaurant_id <> s.restaurant_id then
    raise exception 'Mesa no encontrada';
  end if;

  select array_agg(o.id), coalesce(sum(o.total), 0), max(o.id)
    into v_ids, v_amount, v_max_id
  from (
    select id, total from public.orders
    where table_id = p_table_id
      and status_id in (1, 2, 3)
      and (p_diner_slot is null or diner_slot = p_diner_slot)
      and (p_order_id is null or id = p_order_id)
      and (p_order_ids is null or id = any(p_order_ids))
    for update
  ) o;

  if v_ids is null then raise exception 'La mesa no tiene pedidos activos'; end if;
  if p_order_ids is not null and array_length(v_ids, 1) <> array_length(p_order_ids, 1) then
    raise exception 'Algunos pedidos de la seleccion ya no estan activos';
  end if;
  if v_amount <= 0 then raise exception 'La cuenta esta en $0'; end if;

  insert into public.payments
    (restaurant_id, table_id, order_ids, provider, method, amount, tip, currency, status, paid_at)
  values
    (s.restaurant_id, p_table_id, v_ids, null, p_method, v_amount, v_tip, 'CLP', 'paid', now())
  returning id into v_pid;

  update public.orders
    set status_id = 4, payment_id = v_pid, paid_by = s.user_id
  where id = any(v_ids);

  if v_tip > 0 then
    update public.orders set tip_amount = v_tip where id = v_max_id;
  end if;

  select count(*) into v_remaining
  from public.orders where table_id = p_table_id and status_id in (1, 2, 3);
  if v_remaining = 0 then
    perform public._reset_table_state(p_table_id);
    v_released := true;
  end if;

  return jsonb_build_object(
    'payment_id', v_pid,
    'amount', v_amount,
    'tip', v_tip,
    'paid_ids', to_jsonb(v_ids),
    'table_released', v_released,
    'table_number', v_table.table_number
  );
end;
$$;

revoke all on function public.staff_register_payment(bigint, text, integer, integer, bigint, bigint[]) from public, anon;
grant execute on function public.staff_register_payment(bigint, text, integer, integer, bigint, bigint[]) to authenticated, service_role;

create or replace function public.pay_diner_orders(
  p_table_id bigint,
  p_diner_slot int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id bigint;
  v_paid_ids bigint[];
  v_remaining_count int;
  v_diners_cleared boolean := false;
  v_table_released boolean := false;
begin
  if p_table_id is null or p_diner_slot is null then
    raise exception 'Parametros invalidos';
  end if;

  select restaurant_id into v_restaurant_id
  from public.tables
  where id = p_table_id;

  if v_restaurant_id is null then
    raise exception 'Mesa no encontrada';
  end if;

  if not exists (
    select 1 from public.users
    where auth_user_id = auth.uid()
      and restaurant_id = v_restaurant_id
  ) then
    raise exception 'No autorizado';
  end if;

  with updated as (
    update public.orders
       set status_id = 4
     where table_id = p_table_id
       and diner_slot = p_diner_slot
       and status_id in (1, 2, 3)
     returning id
  )
  select coalesce(array_agg(id), array[]::bigint[]) into v_paid_ids from updated;

  select count(*) into v_remaining_count
  from public.orders
  where table_id = p_table_id
    and status_id in (1, 2, 3);

  if v_remaining_count = 0 then
    perform public._reset_table_state(p_table_id);
    v_diners_cleared := true;
    v_table_released := true;
  end if;

  return jsonb_build_object(
    'paid_ids', to_jsonb(v_paid_ids),
    'diners_cleared', v_diners_cleared,
    'table_released', v_table_released
  );
end;
$$;

alter function public.pay_diner_orders(bigint, int) owner to postgres;
revoke all on function public.pay_diner_orders(bigint, int) from public;
grant execute on function public.pay_diner_orders(bigint, int) to authenticated, service_role;

create or replace function public.cleanup_diners_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status_id = 4 and (old.status_id is distinct from 4) and new.table_id is not null then
    if not exists (
      select 1
      from public.orders
      where table_id = new.table_id
        and status_id in (1, 2, 3)
    ) then
      perform public._reset_table_state(new.table_id);
    end if;
  end if;
  return new;
end;
$$;

alter function public.cleanup_diners_on_payment() owner to postgres;

create or replace function public.payment_apply_gateway_result(
  p_payment_id bigint,
  p_status text,
  p_provider_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pay record;
  v_status text;
  v_settled boolean := false;
  v_remaining int;
begin
  v_status := case p_status
    when 'paid' then 'paid'
    when 'pending' then 'pending'
    when 'authorized' then 'authorized'
    when 'failed' then 'failed'
    when 'cancelled' then 'failed'
    when 'refunded' then 'refunded'
    else null
  end;
  if v_status is null then
    raise exception 'Estado % no soportado', p_status;
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Pago no encontrado';
  end if;

  if v_pay.status = 'paid' and v_status not in ('paid', 'refunded') then
    return jsonb_build_object('status', v_pay.status, 'settled', false, 'ignored', true);
  end if;

  update public.payments set
    status = v_status,
    provider_payment_id = coalesce(nullif(trim(coalesce(p_provider_payment_id, '')), ''), provider_payment_id),
    paid_at = case when v_status = 'paid' and paid_at is null then now() else paid_at end
  where id = p_payment_id;

  if v_status = 'paid' and v_pay.status is distinct from 'paid' then
    update public.orders
      set status_id = 4, payment_id = p_payment_id
    where id = any(v_pay.order_ids)
      and status_id in (1, 2, 3);

    if v_pay.table_id is not null then
      select count(*) into v_remaining
      from public.orders
      where table_id = v_pay.table_id and status_id in (1, 2, 3);

      if v_remaining = 0 then
        perform public._reset_table_state(v_pay.table_id);
      end if;
    end if;
    v_settled := true;
  end if;

  return jsonb_build_object('status', v_status, 'settled', v_settled);
end;
$$;

revoke all on function public.payment_apply_gateway_result(bigint, text, text) from public, anon, authenticated;
grant execute on function public.payment_apply_gateway_result(bigint, text, text) to service_role;
