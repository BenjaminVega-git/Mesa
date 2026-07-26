-- DIVIDIR CUENTA en varias cuentas pequeñas: se suma a lo que ya existe
-- (comensal identificado por diner_slot, pedido puntual por p_order_id) la
-- posibilidad de cobrar un conjunto ARBITRARIO de pedidos activos de la mesa
-- — p. ej. el mesero agrupa "estos 3 pedidos" en la Cuenta A y "estos 2" en
-- la Cuenta B, cada una se cobra por separado con su propio método y boleta.
--
-- Se reemplaza la firma de staff_register_payment (drop + create) para
-- agregar p_order_ids sin dejar sobrecarga ambigua en PostgREST.

drop function if exists public.staff_register_payment(bigint, text, integer, integer, bigint);

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
  if p_method not in ('cash', 'card') then raise exception 'Método de pago inválido'; end if;

  v_tip := greatest(0, coalesce(p_tip, 0));
  if v_tip > 1000000 then raise exception 'Propina fuera de rango'; end if;

  select id, restaurant_id, table_number into v_table
  from public.tables where id = p_table_id;
  if v_table.id is null or v_table.restaurant_id <> s.restaurant_id then
    raise exception 'Mesa no encontrada';
  end if;

  -- Pedidos activos (mesa completa, un comensal, un pedido puntual, o un
  -- CONJUNTO explícito de pedidos para dividir la cuenta), con lock anti
  -- doble-cobro: dos cobros simultáneos de la misma cuenta serializan aquí.
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
    raise exception 'Algunos pedidos de la selección ya no están activos';
  end if;
  if v_amount <= 0 then raise exception 'La cuenta está en $0'; end if;

  insert into public.payments
    (restaurant_id, table_id, order_ids, provider, method, amount, tip, currency, status, paid_at)
  values
    (s.restaurant_id, p_table_id, v_ids, null, p_method, v_amount, v_tip, 'CLP', 'paid', now())
  returning id into v_pid;

  update public.orders
    set status_id = 4, payment_id = v_pid, paid_by = s.user_id
  where id = any(v_ids);

  -- Propina: una sola vez, en la última orden (convención de los reportes).
  if v_tip > 0 then
    update public.orders set tip_amount = v_tip where id = v_max_id;
  end if;

  select count(*) into v_remaining
  from public.orders where table_id = p_table_id and status_id in (1, 2, 3);
  if v_remaining = 0 then
    delete from public.table_diners where table_id = p_table_id;
    update public.tables set current_waiter_id = null where id = p_table_id;
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
