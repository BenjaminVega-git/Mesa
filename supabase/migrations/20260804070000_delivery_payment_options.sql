-- Formas de pago configurables para pedidos online.

begin;

alter table public.restaurants
  add column if not exists delivery_online_payment_enabled boolean not null default true,
  add column if not exists delivery_pay_at_store_enabled boolean not null default true;

create or replace function public.delivery_payment_available(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.provider
  from public.restaurants r
  join public.restaurant_payment_account a on a.restaurant_id = r.id
  where lower(r.delivery_slug) = lower(trim(p_slug))
    and r.delivery_enabled = true
    and r.delivery_online_payment_enabled = true
    and a.status = 'connected'
    and coalesce(a.active, true) = true
  limit 1;
$$;

create or replace function public.get_delivery_options(p_slug text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'home_delivery', r.delivery_home_enabled,
    'pickup', r.pickup_enabled,
    'online_payment', r.delivery_online_payment_enabled,
    'pay_at_store', r.delivery_pay_at_store_enabled
  )
  from public.restaurants r
  where lower(r.delivery_slug) = lower(trim(p_slug))
    and r.delivery_enabled = true
    and (r.delivery_home_enabled or r.pickup_enabled)
  limit 1;
$$;

drop function if exists public.create_delivery_order(text, jsonb, text, text, text, text, uuid, text, text);

create or replace function public.create_delivery_order(
  p_slug text, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_address text, p_reference text, p_request_id uuid, p_payment_method text,
  p_fulfillment_type text
) returns jsonb
language plpgsql security definer set search_path = public
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
  v_fulfillment_type text;
begin
  if p_request_id is null then raise exception 'Solicitud invalida'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'El pedido debe tener entre 1 y 30 productos';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) not between 2 and 80 then raise exception 'Ingresa un nombre valido'; end if;
  if length(trim(coalesce(p_customer_phone, ''))) not between 7 and 24 then raise exception 'Ingresa un telefono valido'; end if;
  if length(coalesce(p_reference, '')) > 250 then raise exception 'La referencia es demasiado larga'; end if;

  v_payment_method := lower(trim(coalesce(p_payment_method, 'pay_at_store')));
  if v_payment_method not in ('online', 'pay_at_store') then raise exception 'Medio de pago invalido'; end if;
  v_fulfillment_type := lower(trim(coalesce(p_fulfillment_type, 'home_delivery')));
  if v_fulfillment_type not in ('home_delivery', 'pickup') then raise exception 'Modalidad de entrega invalida'; end if;

  select r.id, r.order_destination, r.stock_menu_mode, r.delivery_home_enabled, r.pickup_enabled,
         r.delivery_online_payment_enabled, r.delivery_pay_at_store_enabled
    into v_restaurant
  from public.restaurants r
  where lower(r.delivery_slug) = lower(trim(p_slug)) and r.delivery_enabled = true
  limit 1;

  if v_restaurant.id is null then raise exception 'Este menu no acepta pedidos'; end if;
  if v_fulfillment_type = 'home_delivery' and not v_restaurant.delivery_home_enabled then
    raise exception 'Este restaurante no ofrece entrega a domicilio';
  end if;
  if v_fulfillment_type = 'pickup' and not v_restaurant.pickup_enabled then
    raise exception 'Este restaurante no ofrece retiro en tienda';
  end if;
  if v_fulfillment_type = 'home_delivery' and length(trim(coalesce(p_address, ''))) not between 5 and 180 then
    raise exception 'Ingresa una direccion valida';
  end if;
  if v_payment_method = 'online' then
    if not v_restaurant.delivery_online_payment_enabled then raise exception 'El pago anticipado no esta disponible'; end if;
    select public.delivery_payment_available(p_slug) into v_payment_provider;
    if v_payment_provider is null then raise exception 'Este restaurante no tiene pagos en linea habilitados'; end if;
  elsif not v_restaurant.delivery_pay_at_store_enabled then
    raise exception 'El pago al llegar al local no esta disponible';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select id, total, status_id, created_at, delivery_payment_method, fulfillment_type into v_existing
  from public.orders where restaurant_id = v_restaurant.id and delivery_request_id = p_request_id;
  if v_existing.id is not null then
    return jsonb_build_object(
      'id', v_existing.id, 'total', v_existing.total, 'status_id', v_existing.status_id,
      'created_at', v_existing.created_at, 'payment_method', v_existing.delivery_payment_method,
      'fulfillment_type', v_existing.fulfillment_type, 'duplicate', true
    );
  end if;

  v_initial_status := case when v_restaurant.order_destination = 'kitchen' then 2 else 1 end;
  select id into v_pending_status from public.order_status where status_name = 'Pendiente de pago' limit 1;

  insert into public.orders (
    table_id, restaurant_id, total, status_id, created_at, order_type,
    delivery_customer_name, delivery_customer_phone, delivery_address,
    delivery_reference, delivery_request_id, delivery_payment_method, fulfillment_type
  ) values (
    null, v_restaurant.id, 0,
    case when v_payment_method = 'online' then v_pending_status else v_initial_status end,
    now(), 'delivery', left(trim(p_customer_name), 80), left(trim(p_customer_phone), 24),
    case when v_fulfillment_type = 'home_delivery' then left(trim(p_address), 180) else null end,
    nullif(left(trim(coalesce(p_reference, '')), 250), ''),
    p_request_id, v_payment_method, v_fulfillment_type
  ) returning id into v_order_id;

  v_total := public._process_order_items(v_order_id, v_restaurant.id, p_items, coalesce(v_restaurant.stock_menu_mode, 'allow'));
  update public.orders set total = round(v_total)::int where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id, 'total', round(v_total)::int,
    'status_id', case when v_payment_method = 'online' then v_pending_status else v_initial_status end,
    'created_at', now(), 'payment_method', v_payment_method,
    'fulfillment_type', v_fulfillment_type, 'duplicate', false
  );
end;
$$;

revoke all on function public.get_delivery_options(text) from public;
grant execute on function public.get_delivery_options(text) to anon, authenticated, service_role;
revoke all on function public.create_delivery_order(text, jsonb, text, text, text, text, uuid, text, text) from public;
grant execute on function public.create_delivery_order(text, jsonb, text, text, text, text, uuid, text, text) to anon, authenticated, service_role;

commit;
