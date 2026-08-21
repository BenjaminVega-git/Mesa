-- Promociones mixtas: productos fijos + grupos de "arma tu promo".
-- El precio se calcula como (fijos + elecciones) - discount_pct.

alter table public.promotions
  drop constraint if exists promotions_kind_check;
alter table public.promotions
  add constraint promotions_kind_check check (kind in ('fixed', 'build', 'mixed'));

create or replace function public._build_promo_price(
  p_promotion_id bigint,
  p_selections   jsonb
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_kind     text;
  v_pct      int;
  v_subtotal numeric := 0;
  v_discount numeric;
begin
  select pr.kind, coalesce(pr.discount_pct, 0)
    into v_kind, v_pct
  from public.promotions pr
  where pr.id = p_promotion_id;

  if v_kind = 'mixed' then
    select coalesce(sum(coalesce(pv.variant_price, p.product_price) * pi.quantity), 0)
      into v_subtotal
    from public.promotion_items pi
    join public.products p on p.id = pi.product_id
    left join public.product_variants pv on pv.id = pi.variant_id
    where pi.promotion_id = p_promotion_id;
  end if;

  if p_selections is not null and jsonb_typeof(p_selections) = 'array' then
    select v_subtotal + coalesce(sum(coalesce(pv.variant_price, p.product_price)), 0)
      into v_subtotal
    from jsonb_array_elements(p_selections) as sel(val)
    join public.products p on p.id = (sel.val->>'product_id')::bigint
    left join public.product_variants pv on pv.id = nullif(sel.val->>'variant_id', '')::bigint;
  end if;

  v_discount := round(v_subtotal * v_pct / 100.0);

  return jsonb_build_object(
    'subtotal',     round(v_subtotal)::int,
    'discount_pct', v_pct,
    'discount',     v_discount::int,
    'total',        greatest(0, round(v_subtotal) - v_discount)::int
  );
end;
$$;

revoke all on function public._build_promo_price(bigint, jsonb) from public, anon, authenticated;

create or replace function public.promo_save(
  p_id           bigint,
  p_name         text,
  p_description  text,
  p_promo_price  integer,
  p_image_url    text,
  p_active       boolean,
  p_items        jsonb,
  p_kind         text,
  p_groups       jsonb,
  p_discount_pct integer
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_rid       bigint;
  v_promo_id  bigint;
  v_item      jsonb;
  v_grp       jsonb;
  v_pid       bigint;
  v_vid       bigint;
  v_qty       int;
  v_kind      text;
  v_cat       bigint;
  v_min       int;
  v_max       int;
  v_price     int;
  v_pct       int;
begin
  if not public.current_user_is_admin() then raise exception 'No autorizado'; end if;
  v_rid := public.current_user_restaurant_id();
  if v_rid is null then raise exception 'Sin restaurante asociado'; end if;

  v_kind := coalesce(nullif(trim(p_kind), ''), 'fixed');
  if v_kind not in ('fixed', 'build', 'mixed') then raise exception 'Tipo de promocion invalido'; end if;

  if p_name is null or length(trim(p_name)) = 0 then raise exception 'El nombre es obligatorio'; end if;

  if v_kind = 'fixed' then
    if p_promo_price is null or p_promo_price < 0 then raise exception 'Precio de promocion invalido'; end if;
    v_price := p_promo_price;
    v_pct := null;
  else
    if p_discount_pct is null or p_discount_pct < 1 or p_discount_pct > 100 then
      raise exception 'Ingresa un descuento entre 1%% y 100%%';
    end if;
    v_price := 0;
    v_pct := p_discount_pct;
  end if;

  if v_kind in ('fixed', 'mixed') then
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
      raise exception 'La promocion debe incluir al menos un producto fijo';
    end if;
    if jsonb_array_length(p_items) > 30 then raise exception 'La promocion no puede tener mas de 30 productos'; end if;
  end if;

  if v_kind in ('build', 'mixed') then
    if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) < 1 then
      raise exception 'La promocion necesita al menos un grupo de eleccion';
    end if;
    if jsonb_array_length(p_groups) > 15 then raise exception 'Demasiados grupos (maximo 15)'; end if;
  end if;

  if p_id is null then
    insert into public.promotions (restaurant_id, name, description, promo_price, image_url, active, kind, discount_pct)
    values (v_rid, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_price,
            nullif(trim(coalesce(p_image_url, '')), ''), coalesce(p_active, true), v_kind, v_pct)
    returning id into v_promo_id;
  else
    update public.promotions
      set name = trim(p_name),
          description = nullif(trim(coalesce(p_description, '')), ''),
          promo_price = v_price,
          image_url = nullif(trim(coalesce(p_image_url, '')), ''),
          active = coalesce(p_active, true),
          kind = v_kind,
          discount_pct = v_pct,
          updated_at = now()
      where id = p_id and restaurant_id = v_rid
      returning id into v_promo_id;
    if v_promo_id is null then raise exception 'Promocion no encontrada'; end if;
  end if;

  delete from public.promotion_items where promotion_id = v_promo_id;
  delete from public.promotion_groups where promotion_id = v_promo_id;

  if v_kind in ('fixed', 'mixed') then
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_pid := (v_item->>'product_id')::bigint;
      v_vid := nullif(v_item->>'variant_id', '')::bigint;
      v_qty := coalesce((v_item->>'quantity')::int, 1);
      if v_qty < 1 or v_qty > 50 then raise exception 'Cantidad invalida en un producto (1-50)'; end if;

      perform 1 from public.products where id = v_pid and restaurant_id = v_rid;
      if not found then raise exception 'Un producto seleccionado no pertenece a tu restaurante'; end if;

      if v_vid is not null then
        perform 1 from public.product_variants where id = v_vid and product_id = v_pid;
        if not found then raise exception 'Una variante no corresponde a su producto'; end if;
      end if;

      insert into public.promotion_items (promotion_id, product_id, variant_id, quantity)
      values (v_promo_id, v_pid, v_vid, v_qty);
    end loop;
  end if;

  if v_kind in ('build', 'mixed') then
    for v_grp in select * from jsonb_array_elements(p_groups)
    loop
      v_cat := (v_grp->>'category_id')::bigint;
      v_min := coalesce((v_grp->>'min_select')::int, 1);
      v_max := coalesce((v_grp->>'max_select')::int, 1);
      if v_min < 0 or v_max < 1 or v_max < v_min or v_max > 20 then
        raise exception 'Rango de seleccion invalido en un grupo';
      end if;

      perform 1 from public.categories where id = v_cat and restaurant_id = v_rid;
      if not found then raise exception 'Una categoria del combo no pertenece a tu restaurante'; end if;

      insert into public.promotion_groups (promotion_id, name, category_id, min_select, max_select, sort_order)
      select v_promo_id,
             coalesce(nullif(trim(coalesce(v_grp->>'name', '')), ''), c.category_name),
             v_cat, v_min, v_max, coalesce((v_grp->>'sort_order')::int, 0)
      from public.categories c
      where c.id = v_cat;
    end loop;
  end if;

  return v_promo_id;
end;
$$;

revoke all on function public.promo_save(bigint, text, text, integer, text, boolean, jsonb, text, jsonb, integer) from public, anon;
grant execute on function public.promo_save(bigint, text, text, integer, text, boolean, jsonb, text, jsonb, integer) to authenticated, service_role;

create or replace function public._promotion_min_price(
  p_promotion_id bigint
) returns integer
language sql stable security definer set search_path = public
as $$
  select round(
    (
      case when pr.kind = 'mixed' then coalesce((
        select sum(coalesce(pv.variant_price, p.product_price) * pi.quantity)
        from public.promotion_items pi
        join public.products p on p.id = pi.product_id
        left join public.product_variants pv on pv.id = pi.variant_id
        where pi.promotion_id = pr.id
      ), 0) else 0 end
      +
      coalesce((
        select sum(coalesce(gm.min_cost, 0) * g.min_select)
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
      ), 0)
    ) * (100 - coalesce(pr.discount_pct, 0)) / 100.0
  )::int
  from public.promotions pr
  where pr.id = p_promotion_id
$$;

revoke all on function public._promotion_min_price(bigint) from public, anon, authenticated;

create or replace function public._promotion_available(
  p_promotion_id bigint
) returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when pr.kind = 'fixed' then
      exists (select 1 from public.promotion_items pi where pi.promotion_id = pr.id)
      and not exists (
        select 1
        from public.promotion_items pi
        join public.products p on p.id = pi.product_id
        where pi.promotion_id = pr.id and p.status_id <> 1
      )
    when pr.kind = 'build' then
      pr.discount_pct is not null
      and exists (select 1 from public.promotion_groups g where g.promotion_id = pr.id)
      and not exists (
        select 1
        from public.promotion_groups g
        where g.promotion_id = pr.id
          and (
            select count(*)
            from public.products p
            where p.category_id = g.category_id
              and p.restaurant_id = pr.restaurant_id
              and p.status_id = 1
          ) < g.min_select
      )
    when pr.kind = 'mixed' then
      pr.discount_pct is not null
      and exists (select 1 from public.promotion_items pi where pi.promotion_id = pr.id)
      and exists (select 1 from public.promotion_groups g where g.promotion_id = pr.id)
      and not exists (
        select 1
        from public.promotion_items pi
        join public.products p on p.id = pi.product_id
        where pi.promotion_id = pr.id and p.status_id <> 1
      )
      and not exists (
        select 1
        from public.promotion_groups g
        where g.promotion_id = pr.id
          and (
            select count(*)
            from public.products p
            where p.category_id = g.category_id
              and p.restaurant_id = pr.restaurant_id
              and p.status_id = 1
          ) < g.min_select
      )
    else false
  end
  from public.promotions pr
  where pr.id = p_promotion_id
$$;

revoke all on function public._promotion_available(bigint) from public, anon, authenticated;

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
  if v_kind is null or not public._promotion_available(p_promotion_id) then
    raise exception 'La promocion no esta disponible';
  end if;

  if v_kind in ('build', 'mixed') then
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

create or replace function public._promotion_payload(
  p_promotion public.promotions
) returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id',           p_promotion.id,
    'kind',         p_promotion.kind,
    'name',         p_promotion.name,
    'description',  p_promotion.description,
    'promo_price',  p_promotion.promo_price,
    'discount_pct', p_promotion.discount_pct,
    'image_url',    p_promotion.image_url,
    'original_total', (
      select coalesce(sum(coalesce(pv.variant_price, p.product_price) * pi.quantity), 0)
      from public.promotion_items pi
      join public.products p on p.id = pi.product_id
      left join public.product_variants pv on pv.id = pi.variant_id
      where pi.promotion_id = p_promotion.id
    ),
    'min_price', case when p_promotion.kind not in ('build', 'mixed') then null
      else public._promotion_min_price(p_promotion.id) end,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_name', p.product_name,
        'variant_name', pv.variant_name,
        'quantity',     pi.quantity
      ) order by pi.id), '[]'::jsonb)
      from public.promotion_items pi
      join public.products p on p.id = pi.product_id
      left join public.product_variants pv on pv.id = pi.variant_id
      where pi.promotion_id = p_promotion.id
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
      where g.promotion_id = p_promotion.id
    )
  )
$$;

revoke all on function public._promotion_payload(public.promotions) from public, anon, authenticated;

create or replace function public.get_public_menu(p_qr_token text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_table   record;
  v_result  jsonb;
begin
  select * into v_table from public.resolve_qr_token(p_qr_token);
  if v_table.table_id is null then raise exception 'QR no valido'; end if;

  select jsonb_build_object(
    'restaurant', (
      select jsonb_build_object(
        'id', r.id,
        'restaurant_name', r.restaurant_name,
        'restaurant_logo', r.restaurant_logo,
        'menu_template', r.menu_template
      )
      from public.restaurants r
      where r.id = v_table.restaurant_id
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'category_name', c.category_name) order by c.id), '[]'::jsonb)
      from public.categories c
      where c.restaurant_id = v_table.restaurant_id
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'product_name', p.product_name,
        'product_price', p.product_price,
        'product_image', p.product_image,
        'product_description', p.product_description,
        'status_id', p.status_id,
        'category_id', p.category_id,
        'stock_out', coalesce(p.stock_out, false),
        'image_recortada', coalesce(p.image_recortada, false),
        'categories', jsonb_build_object('category_name', pc.category_name),
        'product_variants', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', pv.id,
            'variant_name', pv.variant_name,
            'variant_description', pv.variant_description,
            'variant_price', pv.variant_price,
            'variant_image', pv.variant_image,
            'stock_out', coalesce(pv.stock_out, false)
          ) order by pv.id), '[]'::jsonb)
          from public.product_variants pv
          where pv.product_id = p.id
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
      where p.restaurant_id = v_table.restaurant_id
    ),
    'promotions', (
      select coalesce(jsonb_agg(public._promotion_payload(pr) order by pr.sort_order, pr.id), '[]'::jsonb)
      from public.promotions pr
      where pr.restaurant_id = v_table.restaurant_id
        and pr.active
        and public._promotion_available(pr.id)
    ),
    'tableId', v_table.table_id,
    'tableNumber', v_table.table_number,
    'reservation', (
      select jsonb_build_object('ends_at', tr.ends_at)
      from public.table_reservations tr
      where tr.table_id = v_table.table_id
        and tr.status = 'active'
        and now() >= tr.starts_at
        and now() < tr.ends_at
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
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'category_name', c.category_name) order by c.id), '[]'::jsonb)
      from public.categories c
      where c.restaurant_id = v_rid
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'product_name', p.product_name,
        'product_price', p.product_price,
        'product_image', p.product_image,
        'product_description', p.product_description,
        'codigo', p.codigo,
        'status_id', p.status_id,
        'category_id', p.category_id,
        'stock_out', coalesce(p.stock_out, false),
        'image_recortada', coalesce(p.image_recortada, false),
        'categories', jsonb_build_object('category_name', pc.category_name),
        'product_variants', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', pv.id,
            'variant_name', pv.variant_name,
            'codigo', pv.codigo,
            'variant_description', pv.variant_description,
            'variant_price', pv.variant_price,
            'variant_image', pv.variant_image,
            'stock_out', coalesce(pv.stock_out, false)
          ) order by pv.id), '[]'::jsonb)
          from public.product_variants pv
          where pv.product_id = p.id
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
      where p.restaurant_id = v_rid
    ),
    'promotions', (
      select coalesce(jsonb_agg(public._promotion_payload(pr) order by pr.sort_order, pr.id), '[]'::jsonb)
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

create or replace function public._process_order_items(
  p_order_id bigint,
  p_restaurant_id bigint,
  p_items jsonb,
  p_stock_mode text
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item            jsonb;
  v_product_id      bigint;
  v_variant_id      bigint;
  v_promotion_id    bigint;
  v_qty             int;
  v_notes           text;
  v_ing_notes       text;
  v_menu_notes      text;
  v_unit_price      numeric;
  v_extra           int;
  v_menu_extra      int;
  v_choices         jsonb;
  v_menu_choices    jsonb;
  v_removed_ids     bigint[];
  v_product_name    text;
  v_variant_name    text;
  v_product_status  int;
  v_total           numeric := 0;
  v_recipe          record;
  v_promo_name      text;
  v_promo_price     int;
  v_promo_kind      text;
  v_promo_pct       int;
  v_price_info      jsonb;
  v_detail          text;
  v_comp            record;
  v_needed          numeric;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_promotion_id := nullif(v_item->>'promotion_id', '')::bigint;
    v_qty          := coalesce((v_item->>'quantity')::int, 0);

    if v_qty < 1 or v_qty > 20 then
      raise exception 'Cantidad invalida (1-20)';
    end if;

    if v_promotion_id is not null then
      select pr.name, pr.promo_price, pr.kind, pr.discount_pct
        into v_promo_name, v_promo_price, v_promo_kind, v_promo_pct
      from public.promotions pr
      where pr.id = v_promotion_id and pr.restaurant_id = p_restaurant_id and pr.active;
      if v_promo_name is null or not public._promotion_available(v_promotion_id) then
        raise exception 'La promocion ya no esta disponible';
      end if;

      v_detail := '';

      if v_promo_kind in ('build', 'mixed') then
        if v_promo_pct is null then
          raise exception 'La promocion "%" ya no esta disponible', v_promo_name;
        end if;
        perform public._validate_build_selections(v_promotion_id, p_restaurant_id, v_item->'selections');
        v_price_info  := public._build_promo_price(v_promotion_id, v_item->'selections');
        v_promo_price := (v_price_info->>'total')::int;

        for v_comp in
          select pi.product_id, pi.variant_id, pi.quantity as comp_qty,
                 p.product_name, p.status_id, pv.variant_name, 0 as sort_key
          from public.promotion_items pi
          join public.products p on p.id = pi.product_id
          left join public.product_variants pv on pv.id = pi.variant_id
          where pi.promotion_id = v_promotion_id
            and v_promo_kind = 'mixed'
          union all
          select (sel.val->>'product_id')::bigint as product_id,
                 nullif(sel.val->>'variant_id', '')::bigint as variant_id,
                 1 as comp_qty,
                 p.product_name, p.status_id, pv.variant_name, 1 as sort_key
          from jsonb_array_elements(v_item->'selections') as sel(val)
          join public.products p on p.id = (sel.val->>'product_id')::bigint
          left join public.product_variants pv on pv.id = nullif(sel.val->>'variant_id', '')::bigint
          order by sort_key
        loop
          if v_comp.status_id <> 1 then
            raise exception 'La promocion "%" no esta disponible', v_promo_name;
          end if;

          v_detail := v_detail
            || case when v_detail = '' then '' else ', ' end
            || (v_comp.comp_qty * v_qty)::text || 'x ' || v_comp.product_name
            || coalesce(' (' || v_comp.variant_name || ')', '');

          for v_recipe in
            select r.ingredient_id, r.cantidad, r.bloquea, i.stock_actual
            from public.product_recipes r
            join public.ingredients i on i.id = r.ingredient_id
            where (v_comp.variant_id is not null and r.variant_id = v_comp.variant_id)
               or (v_comp.variant_id is null     and r.product_id = v_comp.product_id)
            for update of i
          loop
            v_needed := v_recipe.cantidad * v_comp.comp_qty * v_qty;
            if p_stock_mode = 'block' and v_recipe.bloquea and v_recipe.stock_actual < v_needed then
              raise exception 'La promocion "%" ya no esta disponible', v_promo_name;
            end if;
            insert into public.stock_movements
              (restaurant_id, ingredient_id, delta, motivo, order_id)
            values
              (p_restaurant_id, v_recipe.ingredient_id, -v_needed, 'venta', p_order_id);
          end loop;
        end loop;

        v_detail := v_detail || format(' - %s%% OFF (antes $%s)',
          v_promo_pct, (v_price_info->>'subtotal'));
      else
        for v_comp in
          select pi.product_id, pi.variant_id, pi.quantity as comp_qty,
                 p.product_name, p.status_id, pv.variant_name
          from public.promotion_items pi
          join public.products p on p.id = pi.product_id
          left join public.product_variants pv on pv.id = pi.variant_id
          where pi.promotion_id = v_promotion_id
          order by pi.id
        loop
          if v_comp.status_id <> 1 then
            raise exception 'La promocion "%" no esta disponible', v_promo_name;
          end if;

          v_detail := v_detail
            || case when v_detail = '' then '' else ', ' end
            || (v_comp.comp_qty * v_qty)::text || 'x ' || v_comp.product_name
            || coalesce(' (' || v_comp.variant_name || ')', '');

          for v_recipe in
            select r.ingredient_id, r.cantidad, r.bloquea, i.stock_actual
            from public.product_recipes r
            join public.ingredients i on i.id = r.ingredient_id
            where (v_comp.variant_id is not null and r.variant_id = v_comp.variant_id)
               or (v_comp.variant_id is null     and r.product_id = v_comp.product_id)
            for update of i
          loop
            v_needed := v_recipe.cantidad * v_comp.comp_qty * v_qty;
            if p_stock_mode = 'block' and v_recipe.bloquea and v_recipe.stock_actual < v_needed then
              raise exception 'La promocion "%" ya no esta disponible', v_promo_name;
            end if;
            insert into public.stock_movements
              (restaurant_id, ingredient_id, delta, motivo, order_id)
            values
              (p_restaurant_id, v_recipe.ingredient_id, -v_needed, 'venta', p_order_id);
          end loop;
        end loop;
      end if;

      insert into public.order_items
        (order_id, product_id, product_quantity, product_name, product_price,
         notes, variant_id, variant_name, promotion_id)
      values
        (p_order_id, null, v_qty, v_promo_name, v_promo_price,
         nullif(left('Incluye: ' || v_detail, 250), ''), null, null, v_promotion_id);

      v_total := v_total + (v_promo_price * v_qty);
      continue;
    end if;

    v_product_id := (v_item->>'product_id')::bigint;
    v_variant_id := nullif(v_item->>'variant_id', '')::bigint;
    v_notes      := left(coalesce(v_item->>'notes', ''), 250);

    select p.product_name, p.product_price, p.status_id
      into v_product_name, v_unit_price, v_product_status
    from public.products p
    where p.id = v_product_id
      and p.restaurant_id = p_restaurant_id;

    if v_product_name is null then
      raise exception 'Producto % no pertenece al restaurante de la mesa', v_product_id;
    end if;

    if v_product_status <> 1 then
      raise exception 'El producto "%" no esta disponible', v_product_name;
    end if;

    v_variant_name := null;

    if v_variant_id is not null then
      select pv.variant_price, pv.variant_name
        into v_unit_price, v_variant_name
      from public.product_variants pv
      where pv.id = v_variant_id
        and pv.product_id = v_product_id;

      if v_variant_name is null then
        raise exception 'La variante % no pertenece al producto %', v_variant_id, v_product_id;
      end if;
    end if;

    v_extra := 0;
    v_menu_extra := 0;
    v_ing_notes := null;
    v_menu_notes := null;
    v_removed_ids := null;
    v_choices := v_item->'ingredient_choices';
    v_menu_choices := v_item->'menu_option_choices';

    if v_choices is not null and jsonb_typeof(v_choices) = 'array' then
      select coalesce(sum(io.extra_price) filter (where ic.action = 'add'), 0),
             string_agg(
               case ic.action
                 when 'remove' then 'Sin ' || i.name
                 else 'Extra ' || i.name || ' (+$' || io.extra_price::text || ')'
               end, ', ' order by ic.ord
             ),
             array_agg(ic.ingredient_id) filter (where ic.action = 'remove')
        into v_extra, v_ing_notes, v_removed_ids
      from jsonb_array_elements(v_choices) with ordinality as ch(val, ord)
      cross join lateral (
        select (ch.val->>'ingredient_id')::bigint as ingredient_id, ch.val->>'action' as action, ch.ord as ord
      ) ic
      join public.product_ingredient_options io
        on io.product_id = v_product_id
        and io.ingredient_id = ic.ingredient_id
        and io.kind = case ic.action when 'remove' then 'removable' when 'add' then 'extra' else 'none' end
      join public.ingredients i on i.id = ic.ingredient_id;
    end if;

    if v_menu_choices is not null and jsonb_typeof(v_menu_choices) = 'array' then
      select coalesce(sum(mo.extra_price), 0),
             string_agg(
               mo.name || case when mo.extra_price > 0 then ' (+$' || mo.extra_price::text || ')' else '' end,
               ', ' order by ord
             )
        into v_menu_extra, v_menu_notes
      from jsonb_array_elements(v_menu_choices) with ordinality as ch(val, ord)
      join public.product_menu_options mo
        on mo.id = (ch.val->>'option_id')::bigint
        and mo.product_id = v_product_id
        and mo.restaurant_id = p_restaurant_id;
    end if;

    v_unit_price := v_unit_price + coalesce(v_extra, 0) + coalesce(v_menu_extra, 0);

    v_notes := left(
      concat_ws(' - ', nullif(v_ing_notes, ''), nullif(v_menu_notes, ''), nullif(v_notes, '')),
      250
    );

    for v_recipe in
      select r.ingredient_id, r.cantidad, r.bloquea, i.stock_actual
      from public.product_recipes r
      join public.ingredients i on i.id = r.ingredient_id
      where (
        (v_variant_id is not null and r.variant_id = v_variant_id)
        or (v_variant_id is null     and r.product_id = v_product_id)
      )
      and r.ingredient_id <> all(coalesce(v_removed_ids, array[]::bigint[]))
      for update of i
    loop
      v_needed := v_recipe.cantidad * v_qty;

      if p_stock_mode = 'block' and v_recipe.bloquea and v_recipe.stock_actual < v_needed then
        raise exception 'El producto "%" ya no esta disponible',
          coalesce(v_variant_name, v_product_name);
      end if;

      insert into public.stock_movements
        (restaurant_id, ingredient_id, delta, motivo, order_id)
      values
        (p_restaurant_id, v_recipe.ingredient_id, -v_needed, 'venta', p_order_id);
    end loop;

    if v_choices is not null and jsonb_typeof(v_choices) = 'array' then
      for v_recipe in
        select ic.ingredient_id, io.quantity as cantidad, i.stock_actual
        from jsonb_array_elements(v_choices) as ch(val)
        cross join lateral (
          select (ch.val->>'ingredient_id')::bigint as ingredient_id, ch.val->>'action' as action
        ) ic
        join public.product_ingredient_options io
          on io.product_id = v_product_id and io.ingredient_id = ic.ingredient_id and io.kind = 'extra'
        join public.ingredients i on i.id = ic.ingredient_id
        where ic.action = 'add'
        for update of i
      loop
        v_needed := v_recipe.cantidad * v_qty;
        if p_stock_mode = 'block' and v_recipe.stock_actual < v_needed then
          raise exception 'Un ingrediente extra de "%" ya no esta disponible', v_product_name;
        end if;
        insert into public.stock_movements
          (restaurant_id, ingredient_id, delta, motivo, order_id)
        values
          (p_restaurant_id, v_recipe.ingredient_id, -v_needed, 'venta', p_order_id);
      end loop;
    end if;

    insert into public.order_items
      (order_id, product_id, product_quantity, product_name, product_price,
       notes, variant_id, variant_name)
    values
      (p_order_id, v_product_id, v_qty, v_product_name, v_unit_price,
       nullif(v_notes, ''), v_variant_id, v_variant_name);

    v_total := v_total + (v_unit_price * v_qty);
  end loop;

  return v_total;
end;
$$;

revoke all on function public._process_order_items(bigint, bigint, jsonb, text) from public, anon, authenticated;

create or replace function public._create_public_order_qr_unchecked(
  p_qr_token    text,
  p_items       jsonb,
  p_diner_token text default null,
  p_coupon_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
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
  v_item_count      int;
  v_created_at      timestamptz;
  v_status_name     text;
  v_diner_slot      int;
  v_diner_label     text;
  v_diner_payload   jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items invalido';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 30 then
    raise exception 'El pedido debe tener entre 1 y 30 lineas';
  end if;

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
    v_diner_slot    := (v_diner_payload->>'slot')::int;
    v_diner_label   := v_diner_payload->>'label';
  end if;

  select r.order_destination, r.stock_menu_mode
    into v_order_dest, v_stock_mode
  from public.restaurants r
  where r.id = v_restaurant_id;

  v_initial_status := case when v_order_dest = 'kitchen' then 2 else 1 end;

  insert into public.orders
    (table_id, restaurant_id, total, status_id, created_at, diner_slot, diner_label)
  values
    (v_table_id, v_restaurant_id, 0, v_initial_status, now(), v_diner_slot, v_diner_label)
  returning id, created_at into v_order_id, v_created_at;

  v_total := public._process_order_items(v_order_id, v_restaurant_id, p_items, v_stock_mode);
  v_discount := public._apply_order_coupon(v_order_id, v_restaurant_id, v_total, p_coupon_code);

  update public.orders
    set total = round(v_total - v_discount)::int,
        discount_amount = round(v_discount)::int
    where id = v_order_id;

  select s.status_name into v_status_name
  from public.order_status s
  where s.id = v_initial_status;

  return jsonb_build_object(
    'id',              v_order_id,
    'status_id',       v_initial_status,
    'status_name',     v_status_name,
    'created_at',      v_created_at,
    'table_id',        v_table_id,
    'restaurant_id',   v_restaurant_id,
    'total',           round(v_total - v_discount)::int,
    'discount_amount', round(v_discount)::int,
    'diner_slot',      v_diner_slot,
    'diner_label',     v_diner_label
  );
end;
$$;

revoke all on function public._create_public_order_qr_unchecked(text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public._create_public_order_qr_unchecked(text, jsonb, text, text) to service_role;

