-- ============================================================================
-- PERSONALIZACIÓN DE INGREDIENTES: el comensal (y el staff, al tomar pedido)
-- puede quitar ingredientes incluidos (gratis) o agregar extras con precio
-- fijo por ingrediente. La configuración (qué ingrediente es removible/extra
-- y su precio) vive en el portal admin, dentro de Inventario.
--
-- De paso se corrige una regresión: las reescrituras de get_public_menu de
-- las promociones (20260720250000 en adelante) dejaron de exponer
-- products.stock_out / products.image_recortada / product_variants.stock_out
-- (columnas reales, ya en uso desde jun-2026) — se restauran aquí.
--
-- Refactor de fondo: el cuerpo de create_public_order_qr (validar líneas,
-- descontar stock, aplicar cupón) se separa en dos helpers internos
-- (_process_order_items, _apply_order_coupon) para que el nuevo
-- staff_create_order (mecanismo de toma de pedidos SIN QR) los reutilice en
-- vez de duplicar ~300 líneas de lógica de precios/stock/promos.
-- ============================================================================

-- 1) Configuración: qué ingredientes son removibles/extra por producto.
create table if not exists public.product_ingredient_options (
  id             bigint generated always as identity primary key,
  restaurant_id  bigint not null references public.restaurants(id) on delete cascade,
  product_id     bigint not null references public.products(id) on delete cascade,
  ingredient_id  bigint not null references public.ingredients(id) on delete cascade,
  kind           text not null check (kind in ('removable', 'extra')),
  extra_price    integer not null default 0 check (extra_price >= 0 and extra_price <= 100000),
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (product_id, ingredient_id)
);
alter table public.product_ingredient_options enable row level security;
revoke all on table public.product_ingredient_options from anon, authenticated;
create index if not exists idx_pio_product on public.product_ingredient_options(product_id);

-- 2) Elecciones del comensal, en el carrito compartido de la mesa.
alter table public.table_cart_items add column if not exists ingredient_choices jsonb;

-- 3) Config admin: listar opciones de un producto (incluye insumos SIN
--    configurar, con kind=null, para que la UI ofrezca marcarlos).
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
    'kind',          o.kind,
    'extra_price',   coalesce(o.extra_price, 0)
  ) order by coalesce(o.sort_order, 999999), i.name), '[]'::jsonb) into v
  from public.ingredients i
  left join public.product_ingredient_options o
    on o.ingredient_id = i.id and o.product_id = p_product_id
  where i.restaurant_id = v_rid;

  return v;
end;
$$;

-- 4) Config admin: reemplaza todas las opciones del producto de una vez.
--    p_options: [{ingredient_id, kind: 'removable'|'extra'|null, extra_price}]
--    kind=null (o ausente) = sin configurar → no se guarda fila.
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
    (restaurant_id, product_id, ingredient_id, kind, extra_price, sort_order)
  select
    v_rid,
    p_product_id,
    (o.val->>'ingredient_id')::bigint,
    o.val->>'kind',
    coalesce((o.val->>'extra_price')::int, 0),
    o.ord
  from jsonb_array_elements(p_options) with ordinality as o(val, ord)
  where o.val->>'kind' in ('removable', 'extra')
    and exists (
      select 1 from public.ingredients i
      where i.id = (o.val->>'ingredient_id')::bigint and i.restaurant_id = v_rid
    );
end;
$$;

do $$
declare fn text;
begin
  for fn in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_list_ingredient_options', 'admin_save_ingredient_options')
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;

-- 5) get_public_menu: restaura stock_out/image_recortada + expone las
--    opciones de personalización por producto (solo lo necesario: nombre,
--    tipo, precio — el comensal no ve el stock del insumo).
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

-- 6) cart_add_item_qr: gana p_ingredient_choices (recalcula precio con
--    extras; los removibles no cambian el precio) y lo guarda para que el
--    carrito muestre "Sin Tomate, Extra Queso (+$500)".
create or replace function public.cart_add_item_qr(
  p_qr_token text,
  p_product_id bigint,
  p_variant_id bigint,
  p_quantity integer,
  p_notes text,
  p_added_by text,
  p_ingredient_choices jsonb default null
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
begin
  select table_id, restaurant_id into v_table_id, v_restaurant_id
  from public.resolve_qr_token(p_qr_token);
  if v_table_id is null then
    raise exception 'Mesa no encontrada o sin QR activo';
  end if;

  perform public.rate_limit_check('cart:' || v_table_id, 60, 60);

  -- BLOQUEO POR RESERVA: no se puede armar carrito en una mesa reservada.
  if public.is_table_reserved_now(v_table_id) then
    raise exception 'Esta mesa está reservada en este horario';
  end if;

  v_qty := coalesce(p_quantity, 1);
  if v_qty < 1 or v_qty > 20 then
    raise exception 'Cantidad inválida (1-20)';
  end if;

  v_notes := nullif(left(coalesce(p_notes, ''), 250), '');

  v_price := public.cart_resolve_price(v_restaurant_id, p_product_id, p_variant_id);
  if v_price is null then
    raise exception 'Producto o variante no pertenece al restaurante de la mesa';
  end if;

  -- Solo elecciones que calcen con una opción real del producto (defensa en
  -- profundidad: si no calza, no se cuenta ni en precio ni en detalle).
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
  limit 1;

  if v_existing_id is not null then
    update public.table_cart_items
    set quantity = quantity + v_qty
    where id = v_existing_id;
  else
    insert into public.table_cart_items
      (restaurant_id, table_id, product_id, variant_id, unit_price, quantity, notes, added_by, ingredient_choices)
    values
      (v_restaurant_id, v_table_id, p_product_id, p_variant_id, v_price + v_extra, v_qty, v_notes,
       nullif(left(coalesce(p_added_by, ''), 100), ''), v_choices);
  end if;
end;
$$;

alter function public.cart_add_item_qr(text, bigint, bigint, integer, text, text, jsonb) owner to postgres;
revoke all on function public.cart_add_item_qr(text, bigint, bigint, integer, text, text, jsonb) from public;
grant execute on function public.cart_add_item_qr(text, bigint, bigint, integer, text, text, jsonb) to anon, authenticated, service_role;

-- 7) get_cart_qr: expone las elecciones + su descripción ya resuelta
--    ("Sin Tomate", "Extra Queso (+$500)"), igual que selection_labels.
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

-- 8) Helper interno: valida/registra las líneas de un pedido (promos,
--    productos + personalización de ingredientes, descuento de stock).
--    Devuelve el subtotal (sin cupón). Compartido por create_public_order_qr
--    y staff_create_order — antes esta lógica solo vivía duplicable dentro de
--    create_public_order_qr.
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
    -- producto cuentan (precio y descripción). El resto se ignora en
    -- silencio (defensa en profundidad, sin filtrar qué existe).
    v_extra := 0;
    v_ing_notes := null;
    v_choices := v_item->'ingredient_choices';
    if v_choices is not null and jsonb_typeof(v_choices) = 'array' then
      select coalesce(sum(io.extra_price) filter (where ic.action = 'add'), 0),
             string_agg(
               case ic.action
                 when 'remove' then 'Sin ' || i.name
                 else 'Extra ' || i.name || ' (+$' || io.extra_price::text || ')'
               end, ', ' order by ic.ord
             )
        into v_extra, v_ing_notes
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

    for v_recipe in
      select r.ingredient_id, r.cantidad, r.bloquea, i.stock_actual
      from public.product_recipes r
      join public.ingredients i on i.id = r.ingredient_id
      where (v_variant_id is not null and r.variant_id = v_variant_id)
         or (v_variant_id is null     and r.product_id = v_product_id)
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

-- 9) Helper interno: cupón (alcance categoría/producto/general), idéntico al
--    que ya vivía dentro de create_public_order_qr. Devuelve el descuento.
create or replace function public._apply_order_coupon(
  p_order_id bigint,
  p_restaurant_id bigint,
  p_total numeric,
  p_coupon_code text
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon   record;
  v_base     numeric := 0;
  v_discount numeric := 0;
  v_now      timestamp;
begin
  if p_coupon_code is null or length(trim(p_coupon_code)) = 0 then
    return 0;
  end if;

  v_now := now() at time zone 'America/Santiago';

  select * into v_coupon
  from public.discount_codes d
  where d.restaurant_id = p_restaurant_id
    and lower(d.code) = lower(trim(p_coupon_code))
    and d.active
    and (d.valid_from is null or v_now::date >= d.valid_from)
    and (d.valid_to   is null or v_now::date <= d.valid_to)
    and (d.days_of_week is null or array_length(d.days_of_week, 1) is null
         or extract(dow from v_now)::int = any(d.days_of_week))
    and (
      d.time_from is null or d.time_to is null
      or (d.time_from <= d.time_to and v_now::time between d.time_from and d.time_to)
      or (d.time_from >  d.time_to and (v_now::time >= d.time_from or v_now::time <= d.time_to))
    )
    and (d.usage_limit is null or d.used_count < d.usage_limit);

  if not found then
    return 0;
  end if;

  if v_coupon.scope = 'category' then
    select coalesce(sum(oi.product_price * oi.product_quantity), 0) into v_base
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id and oi.promotion_id is null
      and p.category_id = v_coupon.scope_category_id;
  elsif v_coupon.scope = 'product' then
    select coalesce(sum(oi.product_price * oi.product_quantity), 0) into v_base
    from public.order_items oi
    where oi.order_id = p_order_id and oi.promotion_id is null
      and oi.product_id = v_coupon.scope_product_id;
  else
    select coalesce(sum(oi.product_price * oi.product_quantity), 0) into v_base
    from public.order_items oi
    where oi.order_id = p_order_id and oi.promotion_id is null;
  end if;

  if v_coupon.min_order_amount is not null and p_total < v_coupon.min_order_amount then
    return 0;
  end if;

  if v_coupon.discount_type = 'percent' then
    v_discount := round(v_base * v_coupon.discount_value / 100.0);
  else
    v_discount := least(v_coupon.discount_value, v_base);
  end if;
  v_discount := greatest(0, least(v_discount, p_total));

  if v_discount > 0 then
    update public.discount_codes set used_count = used_count + 1 where id = v_coupon.id;
    update public.orders
      set discount_code = v_coupon.code, discount_code_id = v_coupon.id
      where id = p_order_id;
  end if;

  return v_discount;
end;
$$;

revoke all on function public._apply_order_coupon(bigint, bigint, numeric, text) from public, anon, authenticated;

-- 10) create_public_order_qr: ahora usa los helpers (misma firma, mismo
--     comportamiento externo; gana ingredientChoices en las líneas producto).
create or replace function public.create_public_order_qr(
  p_qr_token    text,
  p_items       jsonb,
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
  v_item_count      int;
  v_created_at      timestamptz;
  v_status_name     text;
  v_diner_slot      int;
  v_diner_label     text;
  v_diner_payload   jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items inválido';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 30 then
    raise exception 'El pedido debe tener entre 1 y 30 líneas';
  end if;

  select table_id, restaurant_id into v_table_id, v_restaurant_id
  from public.resolve_qr_token(p_qr_token);

  if v_table_id is null then
    raise exception 'Mesa no encontrada o sin QR activo';
  end if;

  if public.is_table_reserved_now(v_table_id) then
    raise exception 'Esta mesa está reservada en este horario';
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

alter function public.create_public_order_qr(text, jsonb, text, text) owner to postgres;
revoke all on function public.create_public_order_qr(text, jsonb, text, text) from public;
grant execute on function public.create_public_order_qr(text, jsonb, text, text) to anon, authenticated, service_role;

-- 11) MECANISMO ALTERNATIVO DE TOMA DE PEDIDOS (sin QR): el staff (mesero o
--     admin) crea el pedido directo por table_id, con SU sesión como
--     credencial — no depende de que la mesa tenga un QR activo. Reutiliza
--     los mismos helpers de precios/stock/promos que el pedido del comensal.
create or replace function public.staff_create_order(
  p_table_id    bigint,
  p_items       jsonb,
  p_coupon_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s                 record;
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
begin
  select * into s from public._charge_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items inválido';
  end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 30 then
    raise exception 'El pedido debe tener entre 1 y 30 líneas';
  end if;

  select restaurant_id into v_restaurant_id from public.tables where id = p_table_id;
  if v_restaurant_id is null or v_restaurant_id <> s.restaurant_id then
    raise exception 'Mesa no encontrada';
  end if;

  -- Rate limit propio del staff (no el de 15/60s pensado para un comensal
  -- único): evita bucles descontrolados sin frenar el ritmo real de un mesero.
  perform public.rate_limit_check('staff_order:' || s.user_id, 40, 60);

  select r.order_destination, r.stock_menu_mode
    into v_order_dest, v_stock_mode
  from public.restaurants r
  where r.id = v_restaurant_id;

  v_initial_status := case when v_order_dest = 'kitchen' then 2 else 1 end;

  insert into public.orders (table_id, restaurant_id, total, status_id, created_at)
  values (p_table_id, v_restaurant_id, 0, v_initial_status, now())
  returning id, created_at into v_order_id, v_created_at;

  v_total := public._process_order_items(v_order_id, v_restaurant_id, p_items, v_stock_mode);
  v_discount := public._apply_order_coupon(v_order_id, v_restaurant_id, v_total, p_coupon_code);

  update public.orders
    set total = round(v_total - v_discount)::int,
        discount_amount = round(v_discount)::int
    where id = v_order_id;

  select s2.status_name into v_status_name
  from public.order_status s2
  where s2.id = v_initial_status;

  return jsonb_build_object(
    'id',              v_order_id,
    'status_id',       v_initial_status,
    'status_name',     v_status_name,
    'created_at',      v_created_at,
    'table_id',        p_table_id,
    'restaurant_id',   v_restaurant_id,
    'total',           round(v_total - v_discount)::int,
    'discount_amount', round(v_discount)::int
  );
end;
$$;

revoke all on function public.staff_create_order(bigint, jsonb, text) from public, anon;
grant execute on function public.staff_create_order(bigint, jsonb, text) to authenticated, service_role;
