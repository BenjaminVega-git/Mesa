-- MECANISMO DE TOMA DE PEDIDOS SIN QR (parte 2/2): el POS del staff necesita
-- la carta y las mesas SIN pasar por ningún qr_token (a diferencia de
-- get_public_menu, pensada para el comensal anónimo). staff_get_menu()
-- devuelve el mismo tipo de payload (categorías, productos con sus opciones
-- de personalización, promociones) más la lista de mesas, todo resuelto por
-- la sesión del staff (mesero o admin) vía current_user_restaurant_id().

create or replace function public.staff_get_menu()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_rid bigint;
  v_result jsonb;
begin
  v_rid := public.current_user_restaurant_id();
  if v_rid is null then raise exception 'No autorizado'; end if;

  select jsonb_build_object(
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'category_name', c.category_name
      ) order by c.id), '[]'::jsonb)
      from public.categories c
      where c.restaurant_id = v_rid
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
        'stock_out',      coalesce(p.stock_out, false),
        'image_recortada', coalesce(p.image_recortada, false),
        'categories',     jsonb_build_object('category_name', pc.category_name),
        'product_variants', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',            pv.id,
            'variant_name',  pv.variant_name,
            'variant_price', pv.variant_price,
            'variant_image', pv.variant_image,
            'stock_out',     coalesce(pv.stock_out, false)
          ) order by pv.id), '[]'::jsonb)
          from public.product_variants pv
          where pv.product_id = p.id
        ),
        'ingredient_options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'ingredient_id', io.ingredient_id,
            'name',          i.name,
            'kind',          io.kind,
            'extra_price',   io.extra_price
          ) order by io.sort_order, i.name), '[]'::jsonb)
          from public.product_ingredient_options io
          join public.ingredients i on i.id = io.ingredient_id
          where io.product_id = p.id
        )
      ) order by p.id), '[]'::jsonb)
      from public.products p
      left join public.categories pc on pc.id = p.category_id
      where p.restaurant_id = v_rid
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
      where pr.restaurant_id = v_rid
        and pr.active
    ),
    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'table_number', t.table_number,
        'claimed', t.current_waiter_id is not null
      ) order by t.table_number), '[]'::jsonb)
      from public.tables t
      where t.restaurant_id = v_rid
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.staff_get_menu() from public, anon;
grant execute on function public.staff_get_menu() to authenticated, service_role;
