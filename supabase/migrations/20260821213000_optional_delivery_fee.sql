-- Tarifa opcional para entrega a domicilio. El monto se fija en el pedido
-- para conservar el valor historico aunque cambie la configuracion del local.

begin;

alter table public.restaurants
  add column if not exists delivery_fee integer;

alter table public.restaurants
  drop constraint if exists restaurants_delivery_fee_check;

alter table public.restaurants
  add constraint restaurants_delivery_fee_check
  check (delivery_fee is null or delivery_fee between 0 and 10000000);

alter table public.orders
  add column if not exists delivery_fee integer not null default 0;

alter table public.orders
  drop constraint if exists orders_delivery_fee_check;

alter table public.orders
  add constraint orders_delivery_fee_check
  check (delivery_fee between 0 and 10000000);

create or replace function public.get_delivery_options(p_slug text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'home_delivery', r.delivery_home_enabled,
    'pickup', r.pickup_enabled,
    'online_payment', r.delivery_online_payment_enabled,
    'pay_at_store', r.delivery_pay_at_store_enabled,
    'delivery_fee', nullif(r.delivery_fee, 0)
  )
  from public.restaurants r
  where lower(r.delivery_slug) = lower(trim(p_slug))
    and r.delivery_enabled = true
    and (r.delivery_home_enabled or r.pickup_enabled)
  limit 1;
$$;

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
  v_subtotal numeric;
  v_delivery_fee integer;
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
         r.delivery_online_payment_enabled, r.delivery_pay_at_store_enabled, r.delivery_fee
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
  select id, total, status_id, created_at, delivery_payment_method, fulfillment_type, delivery_fee into v_existing
  from public.orders where restaurant_id = v_restaurant.id and delivery_request_id = p_request_id;
  if v_existing.id is not null then
    return jsonb_build_object(
      'id', v_existing.id, 'total', v_existing.total, 'status_id', v_existing.status_id,
      'created_at', v_existing.created_at, 'payment_method', v_existing.delivery_payment_method,
      'fulfillment_type', v_existing.fulfillment_type, 'delivery_fee', v_existing.delivery_fee,
      'duplicate', true
    );
  end if;

  v_initial_status := case when v_restaurant.order_destination = 'kitchen' then 2 else 1 end;
  select id into v_pending_status from public.order_status where status_name = 'Pendiente de pago' limit 1;
  v_delivery_fee := case
    when v_fulfillment_type = 'home_delivery' then greatest(0, coalesce(v_restaurant.delivery_fee, 0))
    else 0
  end;

  insert into public.orders (
    table_id, restaurant_id, total, status_id, created_at, order_type,
    delivery_customer_name, delivery_customer_phone, delivery_address,
    delivery_reference, delivery_request_id, delivery_payment_method, fulfillment_type,
    delivery_fee
  ) values (
    null, v_restaurant.id, 0,
    case when v_payment_method = 'online' then v_pending_status else v_initial_status end,
    now(), 'delivery', left(trim(p_customer_name), 80), left(trim(p_customer_phone), 24),
    case when v_fulfillment_type = 'home_delivery' then left(trim(p_address), 180) else null end,
    nullif(left(trim(coalesce(p_reference, '')), 250), ''),
    p_request_id, v_payment_method, v_fulfillment_type, v_delivery_fee
  ) returning id into v_order_id;

  v_subtotal := public._process_order_items(v_order_id, v_restaurant.id, p_items, coalesce(v_restaurant.stock_menu_mode, 'allow'));
  v_total := v_subtotal + v_delivery_fee;
  update public.orders set total = round(v_total)::int where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id, 'total', round(v_total)::int,
    'subtotal', round(v_subtotal)::int, 'delivery_fee', v_delivery_fee,
    'status_id', case when v_payment_method = 'online' then v_pending_status else v_initial_status end,
    'created_at', now(), 'payment_method', v_payment_method,
    'fulfillment_type', v_fulfillment_type, 'duplicate', false
  );
end;
$$;

-- Incluye la entrega como linea separada en boletas y comprobantes sin
-- convertirla en un producto operativo ni afectar inventario/reportes.
create or replace function public.get_payment_receipt(p_payment_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  s record; v jsonb; v_items jsonb; v_tip integer; v_total integer;
  v_net integer; v_iva integer; v_delivery_fee integer;
begin
  select * into s from public._support_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;

  select coalesce(p.tip, 0), p.amount + coalesce(p.tip, 0)
    into v_tip, v_total
  from public.payments p
  where p.id = p_payment_id and p.restaurant_id = s.restaurant_id;

  v_total := coalesce(v_total, 0);
  v_net := round(v_total::numeric / 1.19)::integer;
  v_iva := v_total - v_net;

  select coalesce(jsonb_agg(jsonb_build_object(
      'name', oi.product_name,
      'variant_name', oi.variant_name,
      'quantity', oi.product_quantity,
      'unit_price', oi.product_price,
      'line_total', oi.product_price * oi.product_quantity
    ) order by oi.id), '[]'::jsonb)
    into v_items
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.payment_id = p_payment_id;

  select coalesce(sum(o.delivery_fee), 0)::integer into v_delivery_fee
  from public.orders o
  where o.payment_id = p_payment_id;

  if v_delivery_fee > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'name', 'Costo de entrega', 'variant_name', null,
      'quantity', 1, 'unit_price', v_delivery_fee, 'line_total', v_delivery_fee
    ));
  end if;

  select jsonb_build_object(
    'doc', to_jsonb(d) || jsonb_build_object('net', v_net, 'iva', v_iva, 'total', v_total, 'tip', coalesce(v_tip, 0)),
    'items', v_items,
    'emisor', (
      select jsonb_build_object(
        'rut', tp.rut,
        'razon_social', coalesce(nullif(trim(tp.razon_social), ''), r.restaurant_name, 'Nombre del restaurante'),
        'giro', tp.giro,
        'direccion', tp.direccion,
        'comuna', tp.comuna,
        'actividad_economica', tp.actividad_economica,
        'logo_url', tp.logo_url
      )
      from public.restaurants r
      left join public.restaurant_tax_profile tp on tp.restaurant_id = r.id
      where r.id = s.restaurant_id
    )
  ) into v
  from public.tax_documents d
  join public.payments p on p.id = d.payment_id
  where d.payment_id = p_payment_id
    and p.restaurant_id = s.restaurant_id
    and d.doc_type in (39, 41)
    and not coalesce(d.voided, false)
  order by d.id desc limit 1;

  return v;
end;
$$;

create or replace function public.get_tax_document_item_detail(p_document_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare v_rid bigint; v_payment_id bigint; v_items jsonb; v_delivery_fee integer;
begin
  if not public.current_user_is_admin() then raise exception 'No autorizado'; end if;
  v_rid := public.current_user_restaurant_id();

  select payment_id into v_payment_id
  from public.tax_documents
  where id = p_document_id and restaurant_id = v_rid;

  if v_payment_id is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'name', oi.product_name,
      'variant_name', oi.variant_name,
      'quantity', oi.product_quantity,
      'unit_price', oi.product_price,
      'line_total', oi.product_price * oi.product_quantity
    ) order by oi.id), '[]'::jsonb)
    into v_items
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.payment_id = v_payment_id;

  select coalesce(sum(o.delivery_fee), 0)::integer into v_delivery_fee
  from public.orders o
  where o.payment_id = v_payment_id and o.restaurant_id = v_rid;

  if v_delivery_fee > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'name', 'Costo de entrega', 'variant_name', null,
      'quantity', 1, 'unit_price', v_delivery_fee, 'line_total', v_delivery_fee
    ));
  end if;

  return v_items;
end;
$$;

revoke all on function public.get_delivery_options(text) from public;
grant execute on function public.get_delivery_options(text) to anon, authenticated, service_role;
revoke all on function public.create_delivery_order(text, jsonb, text, text, text, text, uuid, text, text) from public;
grant execute on function public.create_delivery_order(text, jsonb, text, text, text, text, uuid, text, text) to anon, authenticated, service_role;
revoke all on function public.get_tax_document_item_detail(bigint) from public, anon;
grant execute on function public.get_tax_document_item_detail(bigint) to authenticated, service_role;

commit;
