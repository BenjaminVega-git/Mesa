-- Cierra el límite anotado: los ingredientes EXTRA ahora descuentan stock de
-- inventario (antes solo afectaban precio/detalle); los REMOVIBLES ahora
-- saltan su línea de receta (antes se descontaba igual, aunque el comensal
-- lo hubiera quitado).
--
--   · product_ingredient_options gana `quantity` (cuánto insumo consume UN
--     extra, en la unidad del insumo; irrelevante para 'removable'). Default
--     1 para no romper las filas ya configuradas en el batch anterior.
--   · admin_list/save_ingredient_options exponen/reciben esa cantidad.
--   · _process_order_items: excluye del descuento de receta los ingredientes
--     removidos, y agrega un descuento aparte por cada extra elegido
--     (respeta stock_menu_mode = 'block', igual que las recetas normales).

alter table public.product_ingredient_options
  add column if not exists quantity numeric not null default 1
  check (quantity > 0 and quantity <= 100000);

create or replace function public.admin_list_ingredient_options(p_product_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare v_rid bigint; v_owner bigint; v jsonb;
begin
  if not public.current_user_is_admin() then raise exception 'No autorizado'; end if;
  v_rid := public.current_user_restaurant_id();
  select restaurant_id into v_owner from public.products where id = p_product_id;
  if v_owner is null or v_owner <> v_rid then raise exception 'Producto no encontrado'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ingredient_id', i.id,
    'name',          i.name,
    'unit',          i.unit,
    'kind',          o.kind,
    'extra_price',   coalesce(o.extra_price, 0),
    'quantity',      coalesce(o.quantity, 1)
  ) order by coalesce(o.sort_order, 999999), i.name), '[]'::jsonb) into v
  from public.ingredients i
  left join public.product_ingredient_options o
    on o.ingredient_id = i.id and o.product_id = p_product_id
  where i.restaurant_id = v_rid;

  return v;
end;
$$;

create or replace function public.admin_save_ingredient_options(p_product_id bigint, p_options jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_rid bigint; v_owner bigint;
begin
  if not public.current_user_is_admin() then raise exception 'No autorizado'; end if;
  v_rid := public.current_user_restaurant_id();
  select restaurant_id into v_owner from public.products where id = p_product_id;
  if v_owner is null or v_owner <> v_rid then raise exception 'Producto no encontrado'; end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' then raise exception 'options inválido'; end if;

  delete from public.product_ingredient_options where product_id = p_product_id;

  insert into public.product_ingredient_options
    (restaurant_id, product_id, ingredient_id, kind, extra_price, quantity, sort_order)
  select
    v_rid,
    p_product_id,
    (o.val->>'ingredient_id')::bigint,
    o.val->>'kind',
    coalesce((o.val->>'extra_price')::int, 0),
    coalesce((o.val->>'quantity')::numeric, 1),
    o.ord
  from jsonb_array_elements(p_options) with ordinality as o(val, ord)
  where o.val->>'kind' in ('removable', 'extra')
    and exists (
      select 1 from public.ingredients i
      where i.id = (o.val->>'ingredient_id')::bigint and i.restaurant_id = v_rid
    );
end;
$$;

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
  v_unit_price      numeric;
  v_extra           int;
  v_choices         jsonb;
  v_removed_ids     bigint[];
  v_product_name    text;
  v_variant_name    text;
  v_product_status  int;
  v_total           numeric := 0;
  v_created_at      timestamptz;
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
      raise exception 'Cantidad inválida (1-20)';
    end if;

    -- ===== RAMA PROMOCIÓN (sin personalización de ingredientes) =====
    if v_promotion_id is not null then
      select pr.name, pr.promo_price, pr.kind, pr.discount_pct
        into v_promo_name, v_promo_price, v_promo_kind, v_promo_pct
      from public.promotions pr
      where pr.id = v_promotion_id and pr.restaurant_id = p_restaurant_id and pr.active;
      if v_promo_name is null then
        raise exception 'La promoción ya no está disponible';
      end if;

      v_detail := '';

      if v_promo_kind = 'build' then
        if v_promo_pct is null then
          raise exception 'La promoción "%" ya no está disponible', v_promo_name;
        end if;
        perform public._validate_build_selections(v_promotion_id, p_restaurant_id, v_item->'selections');
        v_price_info  := public._build_promo_price(v_promotion_id, v_item->'selections');
        v_promo_price := (v_price_info->>'total')::int;

        for v_comp in
          select (sel.val->>'product_id')::bigint as product_id,
                 nullif(sel.val->>'variant_id', '')::bigint as variant_id,
                 1 as comp_qty,
                 p.product_name, p.status_id, pv.variant_name
          from jsonb_array_elements(v_item->'selections') as sel(val)
          join public.products p on p.id = (sel.val->>'product_id')::bigint
          left join public.product_variants pv on pv.id = nullif(sel.val->>'variant_id', '')::bigint
          order by (sel.val->>'group_id')::bigint
        loop
          if v_comp.status_id <> 1 then
            raise exception 'La promoción "%" no está disponible', v_promo_name;
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
              raise exception 'La promoción "%" ya no está disponible', v_promo_name;
            end if;
            insert into public.stock_movements
              (restaurant_id, ingredient_id, delta, motivo, order_id)
            values
              (p_restaurant_id, v_recipe.ingredient_id, -v_needed, 'venta', p_order_id);
          end loop;
        end loop;

        v_detail := v_detail || format(' — %s%% OFF (antes $%s)',
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
            raise exception 'La promoción "%" no está disponible', v_promo_name;
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
              raise exception 'La promoción "%" ya no está disponible', v_promo_name;
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

    -- ===== RAMA PRODUCTO (con personalización de ingredientes) =====
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
      raise exception 'El producto "%" no está disponible', v_product_name;
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

    -- Personalización: solo elecciones que calcen con una opción real del
    -- producto cuentan (precio, descripción y stock). El resto se ignora en
    -- silencio (defensa en profundidad, sin filtrar qué existe).
    v_extra := 0;
    v_ing_notes := null;
    v_removed_ids := null;
    v_choices := v_item->'ingredient_choices';
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
    v_unit_price := v_unit_price + coalesce(v_extra, 0);

    v_notes := left(
      coalesce(v_ing_notes, '') ||
      case when v_ing_notes is not null and v_notes <> '' then ' — ' else '' end ||
      v_notes,
      250
    );

    -- Receta base: se salta la línea del ingrediente que el comensal quitó.
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
        raise exception 'El producto "%" ya no está disponible',
          coalesce(v_variant_name, v_product_name);
      end if;

      insert into public.stock_movements
        (restaurant_id, ingredient_id, delta, motivo, order_id)
      values
        (p_restaurant_id, v_recipe.ingredient_id, -v_needed, 'venta', p_order_id);
    end loop;

    -- Extras agregados: descuentan su propio stock (quantity configurada
    -- por el admin en Inventario), respetando el mismo modo de bloqueo.
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
          raise exception 'Un ingrediente extra de "%" ya no está disponible', v_product_name;
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
