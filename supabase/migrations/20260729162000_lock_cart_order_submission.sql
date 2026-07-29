-- Evita pedidos duplicados cuando dos dispositivos intentan enviar el mismo
-- carrito casi al mismo tiempo. El lock es transaccional y por mesa.

create or replace function public.create_public_orders_from_cart_qr(
  p_qr_token    text,
  p_diner_token text default null,
  p_coupon_code text default null
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_table_id        bigint;
  v_restaurant_id   bigint;
  v_order_id        bigint;
  v_initial_status  int;
  v_order_dest      text;
  v_stock_mode      text;
  v_total           numeric := 0;
  v_discount        numeric := 0;
  v_final_total     int := 0;
  v_cart_count      int;
  v_created_at      timestamptz;
  v_status_name     text;
  v_submitter_slot  int;
  v_submitter_label text;
  v_diner_payload   jsonb;
  v_group           record;
  v_orders          jsonb := '[]'::jsonb;
  v_first_order     jsonb;
  v_coupon_used     boolean := false;
  v_coupon_code     text;
begin
  select table_id, restaurant_id into v_table_id, v_restaurant_id
  from public.resolve_qr_token(p_qr_token);

  if v_table_id is null then
    raise exception 'Mesa no encontrada o sin QR activo';
  end if;

  perform public.rate_limit_check('order:' || v_table_id, 15, 60);
  perform pg_advisory_xact_lock(hashtext('cart-order:' || v_table_id::text));

  if public.is_table_reserved_now(v_table_id) then
    raise exception 'Esta mesa esta reservada en este horario';
  end if;

  if p_diner_token is not null and length(p_diner_token) >= 8 then
    v_diner_payload := public.claim_diner_slot_qr(p_qr_token, p_diner_token);
    v_submitter_slot  := (v_diner_payload->>'slot')::int;
    v_submitter_label := v_diner_payload->>'label';
  end if;

  select count(*) into v_cart_count
  from public.table_cart_items
  where table_id = v_table_id;

  if v_cart_count < 1 or v_cart_count > 30 then
    raise exception 'El pedido debe tener entre 1 y 30 lineas';
  end if;

  select r.order_destination, r.stock_menu_mode
    into v_order_dest, v_stock_mode
  from public.restaurants r
  where r.id = v_restaurant_id;

  v_initial_status := case when v_order_dest = 'kitchen' then 2 else 1 end;

  select s.status_name into v_status_name
  from public.order_status s
  where s.id = v_initial_status;

  for v_group in
    select
      resolved.diner_slot,
      resolved.diner_label,
      jsonb_agg(jsonb_build_object(
        'product_id', c.product_id,
        'variant_id', c.variant_id,
        'promotion_id', c.promotion_id,
        'selections', c.promo_selections,
        'ingredient_choices', c.ingredient_choices,
        'quantity', c.quantity,
        'notes', c.notes
      ) order by c.created_at asc, c.id asc) as items
    from public.table_cart_items c
    cross join lateral (
      select
        coalesce(c.diner_slot, v_submitter_slot) as diner_slot,
        case
          when coalesce(c.diner_slot, v_submitter_slot) is null then null
          when c.diner_slot is null then v_submitter_label
          else coalesce(c.diner_label, 'Comensal ' || c.diner_slot)
        end as diner_label
    ) resolved
    where c.table_id = v_table_id
    group by resolved.diner_slot, resolved.diner_label
    order by resolved.diner_slot nulls last
  loop
    insert into public.orders
      (table_id, restaurant_id, total, status_id, created_at, diner_slot, diner_label)
    values
      (v_table_id, v_restaurant_id, 0, v_initial_status, now(), v_group.diner_slot, v_group.diner_label)
    returning id, created_at into v_order_id, v_created_at;

    v_total := public._process_order_items(v_order_id, v_restaurant_id, v_group.items, v_stock_mode);
    v_coupon_code := case when v_coupon_used then null else p_coupon_code end;
    v_discount := public._apply_order_coupon(v_order_id, v_restaurant_id, v_total, v_coupon_code);
    if coalesce(v_discount, 0) > 0 then
      v_coupon_used := true;
    end if;

    update public.orders
      set total = round(v_total - v_discount)::int,
          discount_amount = round(v_discount)::int
      where id = v_order_id;

    v_orders := v_orders || jsonb_build_array(jsonb_build_object(
      'id',              v_order_id,
      'status_id',       v_initial_status,
      'status_name',     v_status_name,
      'created_at',      v_created_at,
      'table_id',        v_table_id,
      'restaurant_id',   v_restaurant_id,
      'total',           round(v_total - v_discount)::int,
      'discount_amount', round(v_discount)::int,
      'diner_slot',      v_group.diner_slot,
      'diner_label',     v_group.diner_label
    ));

    v_final_total := v_final_total + round(v_total - v_discount)::int;
  end loop;

  delete from public.table_cart_items where table_id = v_table_id;

  v_first_order := v_orders->0;

  return jsonb_build_object(
    'id',              (v_first_order->>'id')::bigint,
    'status_id',       v_initial_status,
    'status_name',     v_status_name,
    'created_at',      v_first_order->>'created_at',
    'table_id',        v_table_id,
    'restaurant_id',   v_restaurant_id,
    'total',           v_final_total,
    'orders',          v_orders
  );
end;
$$;

alter function public.create_public_orders_from_cart_qr(text, text, text) owner to postgres;
revoke all on function public.create_public_orders_from_cart_qr(text, text, text) from public;
grant execute on function public.create_public_orders_from_cart_qr(text, text, text) to anon, authenticated, service_role;
