-- ============================================================================
-- "ARMA TU PROMO" con % DE DESCUENTO — menú y carrito (parte 2/3).
--   * get_public_menu: expone discount_pct y min_price ("desde $X" = elegir la
--     opción más barata de cada grupo, ya con el % aplicado).
--   * cart_add_promo_qr: el unit_price de la línea build se CALCULA en la base
--     desde las elecciones (_build_promo_price), no viene del cliente.
-- El pedido va en 20260721000002 (parte 3/3).
-- ============================================================================

create or replace function public.get_public_menu(p_qr_token text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_table   record;
  v_result  jsonb;
begin
  select * into v_table from public.resolve_qr_token(p_qr_token);

  if v_table.table_id is null then
    raise exception 'QR no válido';
  end if;

  select jsonb_build_object(
    'restaurant', (
      select jsonb_build_object(
        'id',              r.id,
        'restaurant_name', r.restaurant_name,
        'restaurant_logo', r.restaurant_logo,
        'menu_template',   r.menu_template
      )
      from public.restaurants r
      where r.id = v_table.restaurant_id
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',            c.id,
        'category_name', c.category_name
      ) order by c.id), '[]'::jsonb)
      from public.categories c
      where c.restaurant_id = v_table.restaurant_id
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',             p.id,
        'product_name',   p.product_name,
        'product_price',  p.product_price,
        'product_image',  p.product_image,
        'product_description', p.product_description,
        'status_id',      p.status_id,
        'category_id',    p.category_id,
        'categories',     jsonb_build_object('category_name', pc.category_name),
        'product_variants', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',            pv.id,
            'variant_name',  pv.variant_name,
            'variant_price', pv.variant_price
          ) order by pv.id), '[]'::jsonb)
          from public.product_variants pv
          where pv.product_id = p.id
        )
      ) order by p.id), '[]'::jsonb)
      from public.products p
      left join public.categories pc on pc.id = p.category_id
      where p.restaurant_id = v_table.restaurant_id
    ),
    'promotions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',           pr.id,
        'kind',         pr.kind,
        'name',         pr.name,
        'description',  pr.description,
        'promo_price',  pr.promo_price,
        'discount_pct', pr.discount_pct,
        'image_url',    pr.image_url,
        'original_total', (
          select coalesce(sum(coalesce(pv.variant_price, p.product_price) * pi.quantity), 0)
          from public.promotion_items pi
          join public.products p on p.id = pi.product_id
          left join public.product_variants pv on pv.id = pi.variant_id
          where pi.promotion_id = pr.id
        ),
        -- "desde $X": la combinación más barata posible, ya con el % aplicado.
        'min_price', case when pr.kind <> 'build' then null else (
          select round(
                   coalesce(sum(coalesce(gm.min_cost, 0) * g.min_select), 0)
                   * (100 - coalesce(pr.discount_pct, 0)) / 100.0
                 )::int
          from public.promotion_groups g
          cross join lateral (
            select min(coalesce(vmin.mv, p.product_price)) as min_cost
            from public.products p
            left join lateral (
              select min(pv.variant_price) as mv
              from public.product_variants pv
              where pv.product_id = p.id
            ) vmin on true
            where p.category_id = g.category_id
              and p.restaurant_id = pr.restaurant_id
              and p.status_id = 1
          ) gm
          where g.promotion_id = pr.id
        ) end,
        'items', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'product_name', p.product_name,
            'variant_name', pv.variant_name,
            'quantity',     pi.quantity
          ) order by pi.id), '[]'::jsonb)
          from public.promotion_items pi
          join public.products p on p.id = pi.product_id
          left join public.product_variants pv on pv.id = pi.variant_id
          where pi.promotion_id = pr.id
        ),
        'groups', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',          g.id,
            'name',        g.name,
            'category_id', g.category_id,
            'min_select',  g.min_select,
            'max_select',  g.max_select
          ) order by g.sort_order, g.id), '[]'::jsonb)
          from public.promotion_groups g
          where g.promotion_id = pr.id
        )
      ) order by pr.sort_order, pr.id), '[]'::jsonb)
      from public.promotions pr
      where pr.restaurant_id = v_table.restaurant_id
        and pr.active
        and (
          (pr.kind = 'fixed'
            and exists (select 1 from public.promotion_items pi where pi.promotion_id = pr.id)
            and not exists (
              select 1 from public.promotion_items pi
              join public.products p on p.id = pi.product_id
              where pi.promotion_id = pr.id and p.status_id <> 1
            ))
          or (pr.kind = 'build'
            and pr.discount_pct is not null
            and exists (select 1 from public.promotion_groups g where g.promotion_id = pr.id)
            and not exists (
              select 1 from public.promotion_groups g
              where g.promotion_id = pr.id
                and (
                  select count(*) from public.products p
                  where p.category_id = g.category_id
                    and p.restaurant_id = pr.restaurant_id
                    and p.status_id = 1
                ) < g.min_select
            ))
        )
    ),
    'tableId',     v_table.table_id,
    'tableNumber', v_table.table_number,
    'reservation', (
      select jsonb_build_object('ends_at', tr.ends_at)
      from public.table_reservations tr
      where tr.table_id = v_table.table_id
        and tr.status = 'active'
        and now() >= tr.starts_at
        and now() <  tr.ends_at
      order by tr.starts_at
      limit 1
    )
  ) into v_result;

  return v_result;
end;
$$;

alter function public.get_public_menu(text) owner to postgres;
revoke all on function public.get_public_menu(text) from public;
grant execute on function public.get_public_menu(text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- cart_add_promo_qr: para build, el precio de la línea se calcula en la base.
-- ----------------------------------------------------------------------------
create or replace function public.cart_add_promo_qr(
  p_qr_token     text,
  p_promotion_id bigint,
  p_quantity     integer,
  p_added_by     text,
  p_selections   jsonb default null
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
begin
  select table_id, restaurant_id into v_table_id, v_restaurant_id
  from public.resolve_qr_token(p_qr_token);
  if v_table_id is null then
    raise exception 'Mesa no encontrada o sin QR activo';
  end if;

  v_qty := coalesce(p_quantity, 1);
  if v_qty < 1 or v_qty > 20 then
    raise exception 'Cantidad inválida (1-20)';
  end if;

  select pr.promo_price, pr.kind, pr.discount_pct into v_price, v_kind, v_pct
  from public.promotions pr
  where pr.id = p_promotion_id and pr.restaurant_id = v_restaurant_id and pr.active;
  if v_kind is null then
    raise exception 'La promoción no está disponible';
  end if;

  if v_kind = 'build' then
    if v_pct is null then
      raise exception 'La promoción no está disponible';
    end if;
    perform public._validate_build_selections(p_promotion_id, v_restaurant_id, p_selections);

    -- Precio autoritativo: suma de lo elegido menos el % (calculado en la base).
    v_price := (public._build_promo_price(p_promotion_id, p_selections)->>'total')::int;

    insert into public.table_cart_items
      (restaurant_id, table_id, product_id, variant_id, promotion_id, unit_price, quantity, added_by, promo_selections)
    values
      (v_restaurant_id, v_table_id, null, null, p_promotion_id, v_price, v_qty,
       nullif(left(coalesce(p_added_by, ''), 100), ''), p_selections);
    return;
  end if;

  -- Fixed: comportamiento original (todos los componentes disponibles + dedup).
  select count(*) into v_unavailable
  from public.promotion_items pi
  join public.products p on p.id = pi.product_id
  where pi.promotion_id = p_promotion_id and p.status_id <> 1;
  if v_unavailable > 0 then
    raise exception 'La promoción no está disponible';
  end if;
  if not exists (select 1 from public.promotion_items pi where pi.promotion_id = p_promotion_id) then
    raise exception 'La promoción no está disponible';
  end if;

  select id into v_existing_id
  from public.table_cart_items
  where table_id = v_table_id and promotion_id = p_promotion_id and promo_selections is null
  limit 1;

  if v_existing_id is not null then
    update public.table_cart_items set quantity = quantity + v_qty where id = v_existing_id;
  else
    insert into public.table_cart_items
      (restaurant_id, table_id, product_id, variant_id, promotion_id, unit_price, quantity, added_by)
    values
      (v_restaurant_id, v_table_id, null, null, p_promotion_id, v_price, v_qty,
       nullif(left(coalesce(p_added_by, ''), 100), ''));
  end if;
end;
$$;

alter function public.cart_add_promo_qr(text, bigint, integer, text, jsonb) owner to postgres;
revoke all on function public.cart_add_promo_qr(text, bigint, integer, text, jsonb) from public;
grant execute on function public.cart_add_promo_qr(text, bigint, integer, text, jsonb) to anon, authenticated, service_role;

