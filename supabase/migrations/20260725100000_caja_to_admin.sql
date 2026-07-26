-- El control de caja (abrir/cerrar turno) se muda del portal de meseros al
-- portal de administración: ahora SOLO el admin abre/cierra el turno; los
-- meseros ven su actividad en el nuevo módulo Contabilidad (solo lectura).
--
-- Las funciones ya vivían en public (open/get_current/close_cash_shift, migración
-- waiter_block_d + staff_charge_and_receipt); se reemplazan con el guard de
-- admin. El resto del cuerpo queda idéntico (mismo signature → replace directo).

create or replace function public.open_cash_shift(p_opening integer)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_rid bigint; v_id bigint;
begin
  if not public.current_user_is_admin() then raise exception 'Solo el administrador puede abrir la caja'; end if;
  v_rid := public.current_user_restaurant_id();
  if v_rid is null then raise exception 'No autorizado'; end if;
  if exists (select 1 from public.cash_shifts where restaurant_id = v_rid and closed_at is null) then
    raise exception 'Ya hay un turno de caja abierto';
  end if;
  insert into public.cash_shifts (restaurant_id, opened_by, opening_amount)
  values (v_rid, public._current_staff_id(), coalesce(p_opening, 0))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_current_cash_shift()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_rid bigint;
  v_shift public.cash_shifts;
  v_cash integer; v_card integer; v_online integer; v_legacy integer;
begin
  if not public.current_user_is_admin() then raise exception 'Solo el administrador ve la caja'; end if;
  v_rid := public.current_user_restaurant_id();
  if v_rid is null then raise exception 'No autorizado'; end if;
  select * into v_shift from public.cash_shifts
  where restaurant_id = v_rid and closed_at is null
  order by opened_at desc limit 1;
  if v_shift.id is null then return null; end if;

  select
    coalesce(sum(amount + tip) filter (where method = 'cash'), 0),
    coalesce(sum(amount + tip) filter (where method = 'card'), 0),
    coalesce(sum(amount + tip) filter (where method = 'online'), 0)
    into v_cash, v_card, v_online
  from public.payments
  where restaurant_id = v_rid and status = 'paid' and paid_at >= v_shift.opened_at;

  select coalesce(sum(total + tip_amount), 0) into v_legacy
  from public.orders
  where restaurant_id = v_rid and status_id = 4 and payment_id is null
    and created_at >= v_shift.opened_at;

  return jsonb_build_object(
    'id', v_shift.id,
    'opened_at', v_shift.opened_at,
    'opening_amount', v_shift.opening_amount,
    'sales', (select coalesce(sum(total), 0) from public.orders where restaurant_id = v_rid and status_id = 4 and created_at >= v_shift.opened_at),
    'tips', (select coalesce(sum(tip_amount), 0) from public.orders where restaurant_id = v_rid and status_id = 4 and created_at >= v_shift.opened_at),
    'orders', (select count(*) from public.orders where restaurant_id = v_rid and status_id = 4 and created_at >= v_shift.opened_at),
    'sales_cash', v_cash + v_legacy,
    'sales_card', v_card,
    'sales_online', v_online,
    'expected_cash', v_shift.opening_amount + v_cash + v_legacy
  );
end;
$$;

create or replace function public.close_cash_shift(p_closing integer, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rid bigint; v_id bigint; v_opened timestamptz; v_opening integer;
  v_cash integer; v_card integer; v_online integer; v_legacy integer;
begin
  if not public.current_user_is_admin() then raise exception 'Solo el administrador puede cerrar la caja'; end if;
  v_rid := public.current_user_restaurant_id();
  if v_rid is null then raise exception 'No autorizado'; end if;
  select id, opened_at, opening_amount into v_id, v_opened, v_opening
  from public.cash_shifts
  where restaurant_id = v_rid and closed_at is null
  order by opened_at desc limit 1;
  if v_id is null then raise exception 'No hay turno abierto'; end if;

  select
    coalesce(sum(amount + tip) filter (where method = 'cash'), 0),
    coalesce(sum(amount + tip) filter (where method = 'card'), 0),
    coalesce(sum(amount + tip) filter (where method = 'online'), 0)
    into v_cash, v_card, v_online
  from public.payments
  where restaurant_id = v_rid and status = 'paid' and paid_at >= v_opened;

  select coalesce(sum(total + tip_amount), 0) into v_legacy
  from public.orders
  where restaurant_id = v_rid and status_id = 4 and payment_id is null
    and created_at >= v_opened;

  update public.cash_shifts
    set closed_at = now(), closing_amount = p_closing, notes = p_notes
  where id = v_id;

  return jsonb_build_object(
    'id', v_id,
    'expected', v_opening + v_cash + v_legacy,
    'closing', p_closing,
    'cash_sales', v_cash + v_legacy,
    'card_sales', v_card,
    'online_sales', v_online
  );
end;
$$;

-- Módulos: nace admin/caja (nueva página), muere waiter/caja (ya sin ruta ni
-- control); nace waiter/contabilidad (historial de solo lectura del mesero).
insert into public.platform_modules (area, key, label, description, enabled, locked, sort_order)
values ('admin', 'caja', 'Caja', 'Apertura y cierre de turno de caja, con desglose por método de pago', true, false, 145)
on conflict (area, key) do nothing;

delete from public.platform_modules where area = 'waiter' and key = 'caja';

insert into public.platform_modules (area, key, label, description, enabled, locked, sort_order)
values ('waiter', 'contabilidad', 'Contabilidad', 'Historial de pedidos tomados y boletas generadas por el sistema', true, false, 20)
on conflict (area, key) do nothing;

-- Corre el resto de módulos de mesero un paso (soporte pasa de sort 30 a 30,
-- ya no colisiona porque contabilidad tomó el hueco de caja en 20).
