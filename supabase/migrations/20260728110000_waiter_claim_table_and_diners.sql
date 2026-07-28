-- ============================================================================
-- (1) MESERO RECLAMA MESA SIN ESCANEAR QR: hoy el único camino para que
-- current_waiter_id quede en mí es escanear el QR físico (/r/[qrCode]).
-- reassign_table ya lo permite a nivel de datos (cualquier staff puede
-- llamarla) pero no es atómica (dos meseros pulsando a la vez → "el último
-- que escribe gana"), y no está pensada para auto-asignación desde la UI.
-- waiter_claim_table es atómica (UPDATE ... WHERE current_waiter_id IS NULL,
-- igual que hace el route handler del QR) y devuelve si realmente la tomó.
--
-- (2) COMENSALES DESDE EL POS DEL MESERO: el mesero puede tomar un pedido
-- "para el Comensal N" igual que hace el comensal por QR (claim_diner_slot_qr),
-- así ese pedido participa en la división automática por comensal de
-- PayTableSection sin tocar esa UI — el gap estaba 100% en la creación del
-- pedido (staff_create_order nunca seteaba diner_slot/diner_label).
-- ============================================================================

create or replace function public.waiter_claim_table(p_table_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_staff_id bigint;
  v_rid bigint;
  v_table_rid bigint;
  v_rows int;
begin
  select id, restaurant_id into v_staff_id, v_rid
  from public.users where auth_user_id = auth.uid() and role_id = 1;
  if v_staff_id is null then raise exception 'Solo los meseros pueden tomar mesas'; end if;

  select restaurant_id into v_table_rid from public.tables where id = p_table_id;
  if v_table_rid is null or v_table_rid <> v_rid then raise exception 'Mesa no encontrada'; end if;

  update public.tables
    set current_waiter_id = v_staff_id
  where id = p_table_id and current_waiter_id is null;
  get diagnostics v_rows = row_count;

  return v_rows > 0;
end;
$$;

revoke all on function public.waiter_claim_table(bigint) from public, anon;
grant execute on function public.waiter_claim_table(bigint) to authenticated, service_role;

-- Comensales activos de una mesa (para que el POS ofrezca elegir uno
-- existente en vez de crear siempre uno nuevo).
create or replace function public.staff_list_diners(p_table_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare s record; v_table_rid bigint; v jsonb;
begin
  select * into s from public._charge_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;

  select restaurant_id into v_table_rid from public.tables where id = p_table_id;
  if v_table_rid is null or v_table_rid <> s.restaurant_id then raise exception 'Mesa no encontrada'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'slot', d.diner_slot,
    'label', 'Comensal ' || d.diner_slot
  ) order by d.diner_slot), '[]'::jsonb) into v
  from public.table_diners d
  where d.table_id = p_table_id;

  return v;
end;
$$;

revoke all on function public.staff_list_diners(bigint) from public, anon;
grant execute on function public.staff_list_diners(bigint) to authenticated, service_role;

-- Crea un comensal NUEVO para la mesa (mismo algoritmo que claim_diner_slot_qr:
-- siguiente slot libre, con reintento ante carrera). El token sintético
-- 'staff:<uuid>' identifica que lo abrió el mesero, no un dispositivo real.
create or replace function public.staff_new_diner_slot(p_table_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s record;
  v_table_rid bigint;
  v_slot int;
  i int;
begin
  select * into s from public._charge_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;

  select restaurant_id into v_table_rid from public.tables where id = p_table_id;
  if v_table_rid is null or v_table_rid <> s.restaurant_id then raise exception 'Mesa no encontrada'; end if;

  for i in 1..10 loop
    select coalesce(max(diner_slot), 0) + 1 into v_slot
    from public.table_diners where table_id = p_table_id;

    begin
      insert into public.table_diners (table_id, diner_slot, diner_token)
      values (p_table_id, v_slot, 'staff:' || gen_random_uuid()::text);
      return jsonb_build_object('slot', v_slot, 'label', 'Comensal ' || v_slot);
    exception when unique_violation then
      continue;
    end;
  end loop;

  raise exception 'No se pudo asignar el comensal';
end;
$$;

revoke all on function public.staff_new_diner_slot(bigint) from public, anon;
grant execute on function public.staff_new_diner_slot(bigint) to authenticated, service_role;

-- staff_create_order gana p_diner_slot (4to arg nuevo → firma distinta para
-- PostgREST, hay que tumbar la vieja para no dejar ambigüedad): si viene,
-- DEBE corresponder a un comensal ya reclamado en table_diners para esa
-- mesa (por QR o por staff_new_diner_slot) — defensa en profundidad, nunca
-- se confía en un número de slot arbitrario del cliente.
drop function if exists public.staff_create_order(bigint, jsonb, text);

create or replace function public.staff_create_order(
  p_table_id    bigint,
  p_items       jsonb,
  p_coupon_code text default null,
  p_diner_slot  integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s                 record;
  v_restaurant_id   bigint;
  v_order_id        bigint;
  v_initial_status  int;
  v_order_dest      text;
  v_stock_mode      text;
  v_total           numeric := 0;
  v_discount        numeric := 0;
  v_item_count      int;
  v_created_at      timestamptz;
  v_status_name     text;
  v_diner_label     text;
begin
  select * into s from public._charge_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items inválido';
  end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 30 then
    raise exception 'El pedido debe tener entre 1 y 30 líneas';
  end if;

  select restaurant_id into v_restaurant_id from public.tables where id = p_table_id;
  if v_restaurant_id is null or v_restaurant_id <> s.restaurant_id then
    raise exception 'Mesa no encontrada';
  end if;

  if p_diner_slot is not null then
    if not exists (
      select 1 from public.table_diners
      where table_id = p_table_id and diner_slot = p_diner_slot
    ) then
      raise exception 'Ese comensal no existe en la mesa';
    end if;
    v_diner_label := 'Comensal ' || p_diner_slot;
  end if;

  -- Rate limit propio del staff (no el de 15/60s pensado para un comensal
  -- único): evita bucles descontrolados sin frenar el ritmo real de un mesero.
  perform public.rate_limit_check('staff_order:' || s.user_id, 40, 60);

  select r.order_destination, r.stock_menu_mode
    into v_order_dest, v_stock_mode
  from public.restaurants r
  where r.id = v_restaurant_id;

  v_initial_status := case when v_order_dest = 'kitchen' then 2 else 1 end;

  insert into public.orders (table_id, restaurant_id, total, status_id, created_at, diner_slot, diner_label)
  values (p_table_id, v_restaurant_id, 0, v_initial_status, now(), p_diner_slot, v_diner_label)
  returning id, created_at into v_order_id, v_created_at;

  v_total := public._process_order_items(v_order_id, v_restaurant_id, p_items, v_stock_mode);
  v_discount := public._apply_order_coupon(v_order_id, v_restaurant_id, v_total, p_coupon_code);

  update public.orders
    set total = round(v_total - v_discount)::int,
        discount_amount = round(v_discount)::int
    where id = v_order_id;

  select s2.status_name into v_status_name
  from public.order_status s2
  where s2.id = v_initial_status;

  return jsonb_build_object(
    'id',              v_order_id,
    'status_id',       v_initial_status,
    'status_name',     v_status_name,
    'created_at',      v_created_at,
    'table_id',        p_table_id,
    'restaurant_id',   v_restaurant_id,
    'total',           round(v_total - v_discount)::int,
    'discount_amount', round(v_discount)::int,
    'diner_slot',      p_diner_slot,
    'diner_label',     v_diner_label
  );
end;
$$;

revoke all on function public.staff_create_order(bigint, jsonb, text, integer) from public, anon;
grant execute on function public.staff_create_order(bigint, jsonb, text, integer) to authenticated, service_role;
