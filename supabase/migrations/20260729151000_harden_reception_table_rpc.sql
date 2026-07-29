-- Hace mas robusta la preparacion de Recepcion: no depende del helper de cobro
-- y puede ser llamada por cualquier staff autenticado del restaurante.

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
  v_restaurant_id bigint;
  v_table_id bigint;
begin
  v_restaurant_id := public.current_user_restaurant_id();
  if v_restaurant_id is null then
    raise exception 'No autorizado';
  end if;

  select id into v_table_id
  from public.tables
  where restaurant_id = v_restaurant_id
    and table_number = 0
  limit 1;

  if v_table_id is not null then
    return v_table_id;
  end if;

  begin
    insert into public.tables (table_number, restaurant_id, qr_code_id, current_waiter_id)
    values (0, v_restaurant_id, null, null)
    returning id into v_table_id;
  exception when unique_violation then
    select id into v_table_id
    from public.tables
    where restaurant_id = v_restaurant_id
      and table_number = 0
    limit 1;
  end;

  return v_table_id;
end;
$$;

alter function public.ensure_reception_table() owner to postgres;
revoke all on function public.ensure_reception_table() from public, anon;
grant execute on function public.ensure_reception_table() to authenticated, service_role;
