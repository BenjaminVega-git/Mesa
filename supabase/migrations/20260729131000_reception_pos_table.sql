-- Mesa virtual para pedidos de recepción desde el POS del staff.
-- Se modela como table_number = 0 para reutilizar el flujo existente:
-- pedidos, cocina, cobro, pagos y boletas siguen teniendo table_id.

create unique index if not exists tables_reception_unique
  on public.tables (restaurant_id)
  where table_number = 0;

create or replace function public.ensure_reception_table()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_table_id bigint;
begin
  select * into s from public._charge_current_staff();
  if s.user_id is null then
    raise exception 'No autorizado';
  end if;

  select id into v_table_id
  from public.tables
  where restaurant_id = s.restaurant_id
    and table_number = 0
  limit 1;

  if v_table_id is not null then
    return v_table_id;
  end if;

  begin
    insert into public.tables (table_number, restaurant_id, qr_code_id, current_waiter_id)
    values (0, s.restaurant_id, null, null)
    returning id into v_table_id;
  exception when unique_violation then
    select id into v_table_id
    from public.tables
    where restaurant_id = s.restaurant_id
      and table_number = 0
    limit 1;
  end;

  return v_table_id;
end;
$$;

revoke all on function public.ensure_reception_table() from public, anon;
grant execute on function public.ensure_reception_table() to authenticated, service_role;
