-- Pago online opcional para pedidos delivery.

begin;

alter table public.orders
  add column if not exists delivery_payment_method text;

alter table public.orders
  drop constraint if exists orders_delivery_payment_method_check;

alter table public.orders
  add constraint orders_delivery_payment_method_check
  check (delivery_payment_method is null or delivery_payment_method in ('online', 'pay_at_store'));

insert into public.order_status (status_name)
select 'Pendiente de pago'
where not exists (select 1 from public.order_status where status_name = 'Pendiente de pago');

create or replace function public.delivery_payment_available(p_slug text)
returns text
language sql
stable security definer
set search_path = public
as $$
  select a.provider
  from public.restaurants r
  join public.restaurant_payment_account a on a.restaurant_id = r.id
  where lower(r.delivery_slug) = lower(trim(p_slug))
    and r.delivery_enabled = true
    and a.status = 'connected'
    and coalesce(a.active, true) = true
  limit 1;
$$;

revoke all on function public.delivery_payment_available(text) from public;
grant execute on function public.delivery_payment_available(text) to anon, authenticated, service_role;

drop function if exists public.create_delivery_order(text, jsonb, text, text, text, text, uuid);

create or replace function public.create_delivery_order(
  p_slug text,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_reference text,
  p_request_id uuid,
  p_payment_method text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant record;
  v_existing record;
  v_order_id bigint;
  v_total numeric;
  v_initial_status int;
  v_pending_status int;
  v_payment_provider text;
  v_payment_method text;
begin
  if p_request_id is null then raise exception 'Solicitud invalida'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'El pedido debe tener entre 1 y 30 productos';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) not between 2 and 80 then
    raise exception 'Ingresa un nombre valido';
  end if;
  if length(trim(coalesce(p_customer_phone, ''))) not between 7 and 24 then
    raise exception 'Ingresa un telefono valido';
  end if;
  if length(trim(coalesce(p_address, ''))) not between 5 and 180 then
    raise exception 'Ingresa una direccion valida';
  end if;
  if length(coalesce(p_reference, '')) > 250 then
    raise exception 'La referencia es demasiado larga';
  end if;

  v_payment_method := lower(trim(coalesce(p_payment_method, 'pay_at_store')));
  if v_payment_method not in ('online', 'pay_at_store') then
    raise exception 'Medio de pago invalido';
  end if;

  select r.id, r.order_destination, r.stock_menu_mode
    into v_restaurant
  from public.restaurants r
  where lower(r.delivery_slug) = lower(trim(p_slug))
    and r.delivery_enabled = true
  limit 1;

  if v_restaurant.id is null then raise exception 'Este menu no acepta pedidos a domicilio'; end if;

  if v_payment_method = 'online' then
    select public.delivery_payment_available(p_slug) into v_payment_provider;
    if v_payment_provider is null then
      raise exception 'Este restaurante no tiene pagos en linea habilitados';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select id, total, status_id, created_at, delivery_payment_method into v_existing
  from public.orders
  where restaurant_id = v_restaurant.id and delivery_request_id = p_request_id;

  if v_existing.id is not null then
    return jsonb_build_object(
      'id', v_existing.id, 'total', v_existing.total,
      'status_id', v_existing.status_id, 'created_at', v_existing.created_at,
      'payment_method', v_existing.delivery_payment_method,
      'duplicate', true
    );
  end if;

  v_initial_status := case when v_restaurant.order_destination = 'kitchen' then 2 else 1 end;
  select id into v_pending_status from public.order_status where status_name = 'Pendiente de pago' limit 1;

  insert into public.orders (
    table_id, restaurant_id, total, status_id, created_at, order_type,
    delivery_customer_name, delivery_customer_phone, delivery_address,
    delivery_reference, delivery_request_id, delivery_payment_method
  ) values (
    null, v_restaurant.id, 0,
    case when v_payment_method = 'online' then v_pending_status else v_initial_status end,
    now(), 'delivery', left(trim(p_customer_name), 80), left(trim(p_customer_phone), 24),
    left(trim(p_address), 180), nullif(left(trim(coalesce(p_reference, '')), 250), ''),
    p_request_id, v_payment_method
  ) returning id into v_order_id;

  v_total := public._process_order_items(
    v_order_id, v_restaurant.id, p_items, coalesce(v_restaurant.stock_menu_mode, 'allow')
  );

  update public.orders set total = round(v_total)::int where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id, 'total', round(v_total)::int,
    'status_id', case when v_payment_method = 'online' then v_pending_status else v_initial_status end,
    'created_at', now(), 'payment_method', v_payment_method, 'duplicate', false
  );
end;
$$;

revoke all on function public.create_delivery_order(text, jsonb, text, text, text, text, uuid, text) from public;
grant execute on function public.create_delivery_order(text, jsonb, text, text, text, text, uuid, text)
  to anon, authenticated, service_role;

-- Los pedidos delivery pagados deben entrar al flujo operativo del local en vez
-- de saltar directamente a "Pagado". El pago queda asentado en payment_id.
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
  if v_status is null then raise exception 'Estado % no soportado', p_status; end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Pago no encontrado'; end if;

  if v_pay.status = 'paid' and v_status not in ('paid', 'refunded') then
    return jsonb_build_object('status', v_pay.status, 'settled', false, 'ignored', true);
  end if;

  update public.payments set
    status = v_status,
    provider_payment_id = coalesce(nullif(trim(coalesce(p_provider_payment_id, '')), ''), provider_payment_id),
    paid_at = case when v_status = 'paid' and paid_at is null then now() else paid_at end
  where id = p_payment_id;

  if v_status = 'paid' and v_pay.status is distinct from 'paid' then
    update public.orders o
      set status_id = case
        when o.order_type = 'delivery' and r.order_destination = 'kitchen' then 2
        when o.order_type = 'delivery' then 1
        else 4
      end,
      payment_id = p_payment_id
    from public.restaurants r
    where o.id = any(v_pay.order_ids)
      and o.restaurant_id = r.id
      and o.status_id <> 4;

    if v_pay.table_id is not null then
      select count(*) into v_remaining
      from public.orders
      where table_id = v_pay.table_id and status_id in (1, 2, 3);
      if v_remaining = 0 then perform public._reset_table_state(v_pay.table_id); end if;
    end if;
    v_settled := true;
  end if;

  return jsonb_build_object('status', v_status, 'settled', v_settled);
end;
$$;

revoke all on function public.payment_apply_gateway_result(bigint, text, text) from public, anon, authenticated;
grant execute on function public.payment_apply_gateway_result(bigint, text, text) to service_role;

commit;
