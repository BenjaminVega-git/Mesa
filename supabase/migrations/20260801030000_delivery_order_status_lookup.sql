begin;

create or replace function public.get_delivery_order_status(
  p_slug text,
  p_order_id bigint,
  p_customer_phone text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_restaurant_id bigint;
  v_order record;
  v_phone text;
begin
  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  if p_order_id is null or p_order_id < 1 then raise exception 'Pedido invalido'; end if;
  if length(v_phone) < 7 then raise exception 'Telefono invalido'; end if;

  select id into v_restaurant_id
  from public.restaurants
  where lower(delivery_slug) = lower(trim(p_slug))
    and delivery_enabled = true
  limit 1;

  if v_restaurant_id is null then raise exception 'Menu no disponible'; end if;

  select
    o.id,
    o.total,
    o.status_id,
    o.created_at,
    o.order_type,
    o.fulfillment_type,
    o.delivery_customer_name,
    o.delivery_customer_phone,
    o.delivery_address,
    o.delivery_reference,
    o.delivery_payment_method,
    s.status_name
  into v_order
  from public.orders o
  left join public.order_status s on s.id = o.status_id
  where o.id = p_order_id
    and o.restaurant_id = v_restaurant_id
    and o.order_type = 'delivery'
    and regexp_replace(coalesce(o.delivery_customer_phone, ''), '\D', '', 'g') = v_phone
  limit 1;

  if v_order.id is null then raise exception 'No se encontro el pedido'; end if;

  return jsonb_build_object(
    'id', v_order.id,
    'total', v_order.total,
    'status_id', v_order.status_id,
    'status_name', coalesce(v_order.status_name, 'Sin estado'),
    'created_at', v_order.created_at,
    'fulfillment_type', v_order.fulfillment_type,
    'customer_name', v_order.delivery_customer_name,
    'phone', v_order.delivery_customer_phone,
    'address', v_order.delivery_address,
    'reference', v_order.delivery_reference,
    'payment_method', v_order.delivery_payment_method,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', oi.product_name,
          'variant_name', oi.variant_name,
          'quantity', oi.product_quantity,
          'notes', oi.notes
        )
        order by oi.id
      )
      from public.order_items oi
      where oi.order_id = v_order.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_delivery_order_status(text, bigint, text) from public;
grant execute on function public.get_delivery_order_status(text, bigint, text)
  to anon, authenticated, service_role;

commit;
