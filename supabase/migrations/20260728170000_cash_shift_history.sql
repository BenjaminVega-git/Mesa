-- Rediseño del cierre de caja (más intuitivo + historial + responsable):
-- 1) Se persiste un snapshot del desglose (efectivo/tarjeta/online/propinas/
--    pedidos) en la fila del turno al cerrarlo, en vez de recalcularlo
--    siempre sobre payments/orders por rango de fechas — así el historial
--    no depende de recomputar contra datos que pueden cambiar.
-- 2) Se agrega closed_by (quién cerró) — opened_by ya existía pero nunca se
--    exponía en el JSON de ninguna función; ahora ambos se resuelven a
--    nombre de staff.
-- 3) Nueva función list_cash_shifts: historial de turnos cerrados.

alter table public.cash_shifts add column if not exists closed_by bigint references public.users(id);
alter table public.cash_shifts add column if not exists cash_sales integer;
alter table public.cash_shifts add column if not exists card_sales integer;
alter table public.cash_shifts add column if not exists online_sales integer;
alter table public.cash_shifts add column if not exists tips integer;
alter table public.cash_shifts add column if not exists orders_count integer;

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
    'opened_by_name', (select user_name from public.users where id = v_shift.opened_by),
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
  v_tips integer; v_orders integer; v_closed_by bigint;
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

  select coalesce(sum(tip_amount), 0), count(*) into v_tips, v_orders
  from public.orders
  where restaurant_id = v_rid and status_id = 4 and created_at >= v_opened;

  v_closed_by := public._current_staff_id();

  update public.cash_shifts
    set closed_at = now(),
        closing_amount = p_closing,
        notes = p_notes,
        closed_by = v_closed_by,
        cash_sales = v_cash + v_legacy,
        card_sales = v_card,
        online_sales = v_online,
        tips = v_tips,
        orders_count = v_orders
  where id = v_id;

  return jsonb_build_object(
    'id', v_id,
    'expected', v_opening + v_cash + v_legacy,
    'closing', p_closing,
    'cash_sales', v_cash + v_legacy,
    'card_sales', v_card,
    'online_sales', v_online,
    'closed_by_name', (select user_name from public.users where id = v_closed_by)
  );
end;
$$;

-- Historial de turnos cerrados, más recientes primero.
create or replace function public.list_cash_shifts(p_limit integer default 20)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_rid bigint;
begin
  if not public.current_user_is_admin() then raise exception 'Solo el administrador ve la caja'; end if;
  v_rid := public.current_user_restaurant_id();
  if v_rid is null then raise exception 'No autorizado'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'opened_at', s.opened_at,
      'closed_at', s.closed_at,
      'opened_by_name', ou.user_name,
      'closed_by_name', cu.user_name,
      'opening_amount', s.opening_amount,
      'closing_amount', s.closing_amount,
      'cash_sales', s.cash_sales,
      'card_sales', s.card_sales,
      'online_sales', s.online_sales,
      'tips', s.tips,
      'orders_count', s.orders_count,
      'expected_cash', s.opening_amount + coalesce(s.cash_sales, 0),
      'difference', s.closing_amount - (s.opening_amount + coalesce(s.cash_sales, 0)),
      'notes', s.notes
    ) order by s.opened_at desc)
    from (
      select *
      from public.cash_shifts
      where restaurant_id = v_rid and closed_at is not null
      order by opened_at desc
      limit greatest(1, least(p_limit, 100))
    ) s
    left join public.users ou on ou.id = s.opened_by
    left join public.users cu on cu.id = s.closed_by
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_cash_shifts(integer) from public, anon;
grant execute on function public.list_cash_shifts(integer) to authenticated, service_role;
