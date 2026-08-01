-- Pedidos a domicilio desde el menu publico por slug.
-- El cliente solo envia ids y elecciones; precios, stock y destino se resuelven
-- dentro de la base de datos igual que para los pedidos QR.

begin;

alter table public.orders
  add column if not exists order_type text not null default 'dine_in',
  add column if not exists delivery_customer_name text,
  add column if not exists delivery_customer_phone text,
  add column if not exists delivery_address text,
  add column if not exists delivery_reference text,
  add column if not exists delivery_request_id uuid;

alter table public.orders
  drop constraint if exists orders_order_type_check;

alter table public.orders
  add constraint orders_order_type_check
  check (order_type in ('dine_in', 'delivery'));

create unique index if not exists orders_delivery_request_unique
  on public.orders (restaurant_id, delivery_request_id)
  where delivery_request_id is not null;

create index if not exists orders_delivery_active_idx
  on public.orders (restaurant_id, status_id, created_at desc)
  where order_type = 'delivery';

-- El catalogo delivery necesita las mismas personalizaciones del menu QR.
create or replace function public.get_restaurant_by_slug(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_restaurant_id bigint;
  v_result jsonb;
begin
  select id into v_restaurant_id
  from public.restaurants
  where lower(delivery_slug) = lower(trim(p_slug))
    and delivery_enabled = true
  limit 1;

  if v_restaurant_id is null then return null; end if;

  select jsonb_build_object(
    'restaurant', (
      select jsonb_build_object(
        'id', r.id,
        'restaurant_name', r.restaurant_name,
        'restaurant_logo', r.restaurant_logo,
        'restaurant_city', r.restaurant_city,
        'menu_template', r.menu_template,
        'delivery_slug', r.delivery_slug
      )
      from public.restaurants r where r.id = v_restaurant_id
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'category_name', c.category_name
      ) order by c.id), '[]'::jsonb)
      from public.categories c where c.restaurant_id = v_restaurant_id
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'product_name', p.product_name,
        'product_description', p.product_description,
        'product_price', p.product_price,
        'product_image', p.product_image,
        'image_recortada', coalesce(p.image_recortada, false),
        'category_id', p.category_id,
        'status_id', p.status_id,
        'stock_out', coalesce(p.stock_out, false),
        'category_name', pc.category_name,
        'variants', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', pv.id,
            'variant_name', pv.variant_name,
            'variant_description', pv.variant_description,
            'variant_price', pv.variant_price,
            'variant_image', pv.variant_image,
            'stock_out', coalesce(pv.stock_out, false)
          ) order by pv.id), '[]'::jsonb)
          from public.product_variants pv where pv.product_id = p.id
        ),
        'ingredient_options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'ingredient_id', io.ingredient_id,
            'name', i.name,
            'kind', io.kind,
            'extra_price', io.extra_price
          ) order by io.sort_order, i.name), '[]'::jsonb)
          from public.product_ingredient_options io
          join public.ingredients i on i.id = io.ingredient_id
          where io.product_id = p.id
        ),
        'menu_options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', mo.id,
            'name', mo.name,
            'extra_price', mo.extra_price
          ) order by mo.sort_order, mo.id), '[]'::jsonb)
          from public.product_menu_options mo
          where mo.product_id = p.id
        )
      ) order by p.id), '[]'::jsonb)
      from public.products p
      left join public.categories pc on pc.id = p.category_id
      where p.restaurant_id = v_restaurant_id
        and p.status_id = 1
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_restaurant_by_slug(text) from public;
grant execute on function public.get_restaurant_by_slug(text) to anon, authenticated, service_role;

create or replace function public.create_delivery_order(
  p_slug text,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_reference text,
  p_request_id uuid
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

  select r.id, r.order_destination, r.stock_menu_mode
    into v_restaurant
  from public.restaurants r
  where lower(r.delivery_slug) = lower(trim(p_slug))
    and r.delivery_enabled = true
  limit 1;

  if v_restaurant.id is null then raise exception 'Este menu no acepta pedidos a domicilio'; end if;

  -- Serializa reintentos simultaneos con el mismo id antes de revisar/insertar.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select id, total, status_id, created_at into v_existing
  from public.orders
  where restaurant_id = v_restaurant.id and delivery_request_id = p_request_id;

  if v_existing.id is not null then
    return jsonb_build_object(
      'id', v_existing.id, 'total', v_existing.total,
      'status_id', v_existing.status_id, 'created_at', v_existing.created_at,
      'duplicate', true
    );
  end if;

  v_initial_status := case when v_restaurant.order_destination = 'kitchen' then 2 else 1 end;

  insert into public.orders (
    table_id, restaurant_id, total, status_id, created_at, order_type,
    delivery_customer_name, delivery_customer_phone, delivery_address,
    delivery_reference, delivery_request_id
  ) values (
    null, v_restaurant.id, 0, v_initial_status, now(), 'delivery',
    left(trim(p_customer_name), 80), left(trim(p_customer_phone), 24),
    left(trim(p_address), 180), nullif(left(trim(coalesce(p_reference, '')), 250), ''),
    p_request_id
  ) returning id into v_order_id;

  v_total := public._process_order_items(
    v_order_id,
    v_restaurant.id,
    p_items,
    coalesce(v_restaurant.stock_menu_mode, 'allow')
  );

  update public.orders set total = round(v_total)::int where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id, 'total', round(v_total)::int,
    'status_id', v_initial_status, 'created_at', now(),
    'duplicate', false
  );
end;
$$;

revoke all on function public.create_delivery_order(text, jsonb, text, text, text, text, uuid) from public;
grant execute on function public.create_delivery_order(text, jsonb, text, text, text, text, uuid)
  to anon, authenticated, service_role;

commit;
