-- Guarda el comensal en cada linea del carrito al momento de agregarla.
-- Antes, el pedido completo tomaba el comensal del dispositivo que apretaba
-- "enviar", mezclando cuentas cuando varias personas armaban el mismo carrito.

alter table public.table_cart_items
  add column if not exists diner_slot int,
  add column if not exists diner_label text;

create index if not exists table_cart_items_table_diner_idx
  on public.table_cart_items (table_id, diner_slot);

create or replace function public.cart_add_item_qr(
  p_qr_token text,
  p_product_id bigint,
  p_variant_id bigint,
  p_quantity integer,
  p_notes text,
  p_added_by text,
  p_ingredient_choices jsonb default null,
  p_diner_token text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id      bigint;
  v_restaurant_id bigint;
  v_price         int;
  v_extra         int := 0;
  v_qty           int;
  v_notes         text;
  v_choices       jsonb;
  v_existing_id   uuid;
  v_diner_payload jsonb;
  v_diner_slot    int;
  v_diner_label   text;
begin
  select table_id, restaurant_id into v_table_id, v_restaurant_id
  from public.resolve_qr_token(p_qr_token);
  if v_table_id is null then
    raise exception 'Mesa no encontrada o sin QR activo';
  end if;

  perform public.rate_limit_check('cart:' || v_table_id, 60, 60);

  if public.is_table_reserved_now(v_table_id) then
    raise exception 'Esta mesa esta reservada en este horario';
  end if;

  if p_diner_token is not null and length(p_diner_token) >= 8 then
    v_diner_payload := public.claim_diner_slot_qr(p_qr_token, p_diner_token);
    v_diner_slot    := (v_diner_payload->>'slot')::int;
    v_diner_label   := v_diner_payload->>'label';
  end if;

  v_qty := coalesce(p_quantity, 1);
  if v_qty < 1 or v_qty > 20 then
    raise exception 'Cantidad invalida (1-20)';
  end if;

  v_notes := nullif(left(coalesce(p_notes, ''), 250), '');

  v_price := public.cart_resolve_price(v_restaurant_id, p_product_id, p_variant_id);
  if v_price is null then
    raise exception 'Producto o variante no pertenece al restaurante de la mesa';
  end if;

  if p_ingredient_choices is not null and jsonb_typeof(p_ingredient_choices) = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('ingredient_id', ic.ingredient_id, 'action', ic.action)), null),
           coalesce(sum(io.extra_price) filter (where ic.action = 'add'), 0)
      into v_choices, v_extra
    from jsonb_array_elements(p_ingredient_choices) as ch(val)
    cross join lateral (
      select (ch.val->>'ingredient_id')::bigint as ingredient_id, ch.val->>'action' as action
    ) ic
    join public.product_ingredient_options io
      on io.product_id = p_product_id
      and io.ingredient_id = ic.ingredient_id
      and io.kind = case ic.action when 'remove' then 'removable' when 'add' then 'extra' else 'none' end;
  end if;

  select id into v_existing_id
  from public.table_cart_items
  where table_id = v_table_id
    and product_id = p_product_id
    and variant_id is not distinct from p_variant_id
    and notes is not distinct from v_notes
    and ingredient_choices is not distinct from v_choices
    and diner_slot is not distinct from v_diner_slot
  limit 1;

  if v_existing_id is not null then
    update public.table_cart_items
    set quantity = quantity + v_qty
    where id = v_existing_id;
  else
    insert into public.table_cart_items
      (restaurant_id, table_id, product_id, variant_id, unit_price, quantity, notes, added_by,
       ingredient_choices, diner_slot, diner_label)
    values
      (v_restaurant_id, v_table_id, p_product_id, p_variant_id, v_price + v_extra, v_qty, v_notes,
       nullif(left(coalesce(p_added_by, ''), 100), ''), v_choices, v_diner_slot, v_diner_label);
  end if;
end;
$$;

alter function public.cart_add_item_qr(text, bigint, bigint, integer, text, text, jsonb, text) owner to postgres;
revoke all on function public.cart_add_item_qr(text, bigint, bigint, integer, text, text, jsonb, text) from public;
grant execute on function public.cart_add_item_qr(text, bigint, bigint, integer, text, text, jsonb, text) to anon, authenticated, service_role;

create or replace function public.cart_add_promo_qr(
  p_qr_token     text,
  p_promotion_id bigint,
  p_quantity     integer,
  p_added_by     text,
  p_selections   jsonb default null,
  p_diner_token  text default null
) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_table_id      bigint;
  v_restaurant_id bigint;
  v_qty           int;
  v_price         int;
  v_kind          text;
  v_pct           int;
  v_unavailable   int;
  v_existing_id   uuid;
  v_diner_payload jsonb;
  v_diner_slot    int;
  v_diner_label   text;
begin
  select table_id, restaurant_id into v_table_id, v_restaurant_id
  from public.resolve_qr_token(p_qr_token);
  if v_table_id is null then
    raise exception 'Mesa no encontrada o sin QR activo';
  end if;

  if p_diner_token is not null and length(p_diner_token) >= 8 then
    v_diner_payload := public.claim_diner_slot_qr(p_qr_token, p_diner_token);
    v_diner_slot    := (v_diner_payload->>'slot')::int;
    v_diner_label   := v_diner_payload->>'label';
  end if;

  v_qty := coalesce(p_quantity, 1);
  if v_qty < 1 or v_qty > 20 then
    raise exception 'Cantidad invalida (1-20)';
  end if;

  select pr.promo_price, pr.kind, pr.discount_pct into v_price, v_kind, v_pct
  from public.promotions pr
  where pr.id = p_promotion_id and pr.restaurant_id = v_restaurant_id and pr.active;
  if v_kind is null then
    raise exception 'La promocion no esta disponible';
  end if;

  if v_kind = 'build' then
    if v_pct is null then
      raise exception 'La promocion no esta disponible';
    end if;
    perform public._validate_build_selections(p_promotion_id, v_restaurant_id, p_selections);

    v_price := (public._build_promo_price(p_promotion_id, p_selections)->>'total')::int;

    insert into public.table_cart_items
      (restaurant_id, table_id, product_id, variant_id, promotion_id, unit_price, quantity, added_by,
       promo_selections, diner_slot, diner_label)
    values
      (v_restaurant_id, v_table_id, null, null, p_promotion_id, v_price, v_qty,
       nullif(left(coalesce(p_added_by, ''), 100), ''), p_selections, v_diner_slot, v_diner_label);
    return;
  end if;

  select count(*) into v_unavailable
  from public.promotion_items pi
  join public.products p on p.id = pi.product_id
  where pi.promotion_id = p_promotion_id and p.status_id <> 1;
  if v_unavailable > 0 then
    raise exception 'La promocion no esta disponible';
  end if;
  if not exists (select 1 from public.promotion_items pi where pi.promotion_id = p_promotion_id) then
    raise exception 'La promocion no esta disponible';
  end if;

  select id into v_existing_id
  from public.table_cart_items
  where table_id = v_table_id
    and promotion_id = p_promotion_id
    and promo_selections is null
    and diner_slot is not distinct from v_diner_slot
  limit 1;

  if v_existing_id is not null then
    update public.table_cart_items set quantity = quantity + v_qty where id = v_existing_id;
  else
    insert into public.table_cart_items
      (restaurant_id, table_id, product_id, variant_id, promotion_id, unit_price, quantity, added_by,
       diner_slot, diner_label)
    values
      (v_restaurant_id, v_table_id, null, null, p_promotion_id, v_price, v_qty,
       nullif(left(coalesce(p_added_by, ''), 100), ''), v_diner_slot, v_diner_label);
  end if;
end;
$$;

alter function public.cart_add_promo_qr(text, bigint, integer, text, jsonb, text) owner to postgres;
revoke all on function public.cart_add_promo_qr(text, bigint, integer, text, jsonb, text) from public;
grant execute on function public.cart_add_promo_qr(text, bigint, integer, text, jsonb, text) to anon, authenticated, service_role;

create or replace function public.get_cart_qr(p_qr_token text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_table_id bigint;
  v_result   jsonb;
begin
  select table_id into v_table_id from public.resolve_qr_token(p_qr_token);
  if v_table_id is null then
    raise exception 'Mesa no encontrada o sin QR activo';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',         c.id,
    'product_id', c.product_id,
    'variant_id', c.variant_id,
    'promotion_id', c.promotion_id,
    'promo_selections', c.promo_selections,
    'ingredient_choices', c.ingredient_choices,
    'ingredient_labels', case when c.ingredient_choices is null then null else (
      select coalesce(jsonb_agg(
        case ic.action
          when 'remove' then 'Sin ' || i.name
          else 'Extra ' || i.name || ' (+$' || io.extra_price::text || ')'
        end
        order by ord
      ), '[]'::jsonb)
      from jsonb_array_elements(c.ingredient_choices) with ordinality as ch(val, ord)
      cross join lateral (
        select (ch.val->>'ingredient_id')::bigint as ingredient_id, ch.val->>'action' as action
      ) ic
      join public.ingredients i on i.id = ic.ingredient_id
      left join public.product_ingredient_options io
        on io.product_id = c.product_id and io.ingredient_id = ic.ingredient_id
    ) end,
    'quantity',   c.quantity,
    'unit_price', c.unit_price,
    'notes',      c.notes,
    'added_by',   c.added_by,
    'diner_slot', c.diner_slot,
    'diner_label', c.diner_label,
    'created_at', c.created_at,
    'products',   case when c.product_id is null then null
      else jsonb_build_object('product_name', p.product_name, 'product_image', p.product_image) end,
    'product_variants', case
      when c.variant_id is null then null
      else jsonb_build_object('variant_name', pv.variant_name, 'variant_image', pv.variant_image)
    end,
    'promotion',  case when c.promotion_id is null then null
      else jsonb_build_object(
        'name',      pr.name,
        'image_url', pr.image_url,
        'kind',      pr.kind,
        'selection_labels', case when c.promo_selections is null then null else (
          select coalesce(jsonb_agg(
            coalesce(sp.product_name, 'Producto')
            || coalesce(' (' || spv.variant_name || ')', '')
            order by ord
          ), '[]'::jsonb)
          from jsonb_array_elements(c.promo_selections) with ordinality as sel(val, ord)
          left join public.products sp on sp.id = (sel.val->>'product_id')::bigint
          left join public.product_variants spv on spv.id = nullif(sel.val->>'variant_id', '')::bigint
        ) end
      ) end
  ) order by c.created_at asc), '[]'::jsonb)
  into v_result
  from public.table_cart_items c
  left join public.products p on p.id = c.product_id
  left join public.product_variants pv on pv.id = c.variant_id
  left join public.promotions pr on pr.id = c.promotion_id
  where c.table_id = v_table_id;

  return v_result;
end;
$$;

alter function public.get_cart_qr(text) owner to postgres;
revoke all on function public.get_cart_qr(text) from public;
grant execute on function public.get_cart_qr(text) to anon, authenticated, service_role;

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

  if public.is_table_reserved_now(v_table_id) then
    raise exception 'Esta mesa esta reservada en este horario';
  end if;

  perform public.rate_limit_check('order:' || v_table_id, 15, 60);

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
