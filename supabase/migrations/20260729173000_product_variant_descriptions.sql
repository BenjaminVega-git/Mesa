-- Optional descriptions for product variants.

alter table public.product_variants
  add column if not exists variant_description text;

alter table public.product_variants
  drop constraint if exists product_variants_description_length;

alter table public.product_variants
  add constraint product_variants_description_length
  check (
    variant_description is null
    or char_length(variant_description) <= 1000
  );

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
    raise exception 'QR no valido';
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
        'stock_out',      coalesce(p.stock_out, false),
        'image_recortada', coalesce(p.image_recortada, false),
        'categories',     jsonb_build_object('category_name', pc.category_name),
        'product_variants', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',                  pv.id,
            'variant_name',        pv.variant_name,
            'variant_description', pv.variant_description,
            'variant_price',       pv.variant_price,
            'variant_image',       pv.variant_image,
            'stock_out',           coalesce(pv.stock_out, false)
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
            'id',                  pv.id,
            'variant_name',        pv.variant_name,
            'variant_description', pv.variant_description,
            'variant_price',       pv.variant_price,
            'variant_image',       pv.variant_image,
            'stock_out',           coalesce(pv.stock_out, false)
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

create or replace function public.get_restaurant_by_slug(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_restaurant_id bigint;
  v_result jsonb;
begin
  select id into v_restaurant_id
  from public.restaurants
  where lower(delivery_slug) = lower(p_slug)
    and delivery_enabled = true
  limit 1;

  if v_restaurant_id is null then
    return null;
  end if;

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
      ) order by c.category_name), '[]'::jsonb)
      from public.categories c where c.restaurant_id = v_restaurant_id
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'product_name', p.product_name,
        'product_description', p.product_description,
        'product_price', p.product_price,
        'product_image', p.product_image,
        'category_id', p.category_id,
        'status_id', p.status_id,
        'category_name', (select cc.category_name from public.categories cc where cc.id = p.category_id),
        'variants', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', v.id,
            'variant_name', v.variant_name,
            'variant_description', v.variant_description,
            'variant_price', v.variant_price,
            'variant_image', v.variant_image
          ) order by v.id), '[]'::jsonb)
          from public.product_variants v where v.product_id = p.id
        )
      ) order by p.id), '[]'::jsonb)
      from public.products p
      where p.restaurant_id = v_restaurant_id
        and p.status_id = 1
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_restaurant_by_slug(text) from public;
grant execute on function public.get_restaurant_by_slug(text) to anon, authenticated;
