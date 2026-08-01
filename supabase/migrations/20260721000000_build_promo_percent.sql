-- ============================================================================
-- "ARMA TU PROMO" pasa de PRECIO FIJO a % DE DESCUENTO (parte 1/2).
-- Motivo (negocio): con precio fijo, elegir la opción cara o la barata costaba
-- lo mismo — el local perdía margen en un caso y el comensal no percibía
-- descuento en el otro. Ahora el combo build define un % que se aplica sobre la
-- suma de lo que el comensal efectivamente eligió.
--   * promotions.discount_pct (1..100). Lo usan SOLO las promos kind='build';
--     las kind='fixed' siguen con promo_price (sin cambios).
--   * _build_promo_price(promotion_id, selections) -> {subtotal, discount_pct,
--     discount, total}: precio autoritativo del combo, calculado en la base.
--     Lo usan el carrito y la creación del pedido (nunca se confía en el
--     precio que mande el cliente).
--   * promo_save gana p_discount_pct (nueva firma, se dropea la de 9 args) y
--     promo_list lo devuelve.
-- El menú y el pedido van en 20260721000001 (parte 2/2).
-- ============================================================================

alter table public.promotions
  add column if not exists discount_pct integer;
alter table public.promotions
  drop constraint if exists promotions_discount_pct_check;
alter table public.promotions
  add constraint promotions_discount_pct_check
  check (discount_pct is null or (discount_pct >= 1 and discount_pct <= 100));

-- ----------------------------------------------------------------------------
-- Precio de un combo build según las elecciones del comensal. El precio de cada
-- elección es el de su variante si eligió una, si no el del producto. Devuelve
-- el desglose para poder mostrarlo. Se invoca desde funciones DEFINER que ya
-- resolvieron el restaurante, por eso no lleva grant a anon.
-- ----------------------------------------------------------------------------
create or replace function public._build_promo_price(
  p_promotion_id bigint,
  p_selections   jsonb
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_pct      int;
  v_subtotal numeric := 0;
  v_discount numeric;
begin
  select coalesce(pr.discount_pct, 0) into v_pct
  from public.promotions pr where pr.id = p_promotion_id;

  if p_selections is null or jsonb_typeof(p_selections) <> 'array' then
    return jsonb_build_object('subtotal', 0, 'discount_pct', v_pct, 'discount', 0, 'total', 0);
  end if;

  select coalesce(sum(coalesce(pv.variant_price, p.product_price)), 0)
  into v_subtotal
  from jsonb_array_elements(p_selections) as sel(val)
  join public.products p on p.id = (sel.val->>'product_id')::bigint
  left join public.product_variants pv on pv.id = nullif(sel.val->>'variant_id', '')::bigint;

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

-- ----------------------------------------------------------------------------
-- promo_list: agrega discount_pct.
-- ----------------------------------------------------------------------------
create or replace function public.promo_list()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_rid bigint; v_result jsonb;
begin
  if not public.current_user_is_admin() then raise exception 'No autorizado'; end if;
  v_rid := public.current_user_restaurant_id();
  if v_rid is null then raise exception 'Sin restaurante asociado'; end if;

  select coalesce(jsonb_agg(promo order by (promo->>'sort_order')::int, (promo->>'id')::bigint), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id',           pr.id,
      'kind',         pr.kind,
      'name',         pr.name,
      'description',  pr.description,
      'promo_price',  pr.promo_price,
      'discount_pct', pr.discount_pct,
      'image_url',    pr.image_url,
      'active',       pr.active,
      'sort_order',   pr.sort_order,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'product_id',   pi.product_id,
          'variant_id',   pi.variant_id,
          'quantity',     pi.quantity,
          'product_name', p.product_name,
          'variant_name', pv.variant_name,
          'unit_price',   coalesce(pv.variant_price, p.product_price),
          'available',    (p.status_id = 1)
        ) order by pi.id), '[]'::jsonb)
        from public.promotion_items pi
        join public.products p on p.id = pi.product_id
        left join public.product_variants pv on pv.id = pi.variant_id
        where pi.promotion_id = pr.id
      ),
      'original_total', (
        select coalesce(sum(coalesce(pv.variant_price, p.product_price) * pi.quantity), 0)
        from public.promotion_items pi
        join public.products p on p.id = pi.product_id
        left join public.product_variants pv on pv.id = pi.variant_id
        where pi.promotion_id = pr.id
      ),
      'groups', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id',            g.id,
          'name',          g.name,
          'category_id',   g.category_id,
          'category_name', c.category_name,
          'min_select',    g.min_select,
          'max_select',    g.max_select,
          'sort_order',    g.sort_order,
          'available_count', (
            select count(*) from public.products p
            where p.category_id = g.category_id
              and p.restaurant_id = v_rid
              and p.status_id = 1
          )
        ) order by g.sort_order, g.id), '[]'::jsonb)
        from public.promotion_groups g
        join public.categories c on c.id = g.category_id
        where g.promotion_id = pr.id
      )
    ) as promo
    from public.promotions pr
    where pr.restaurant_id = v_rid
  ) s;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- promo_save: gana p_discount_pct. Para 'build' el % es obligatorio (1..100) y
-- promo_price queda en 0 (no se usa); para 'fixed' se conserva promo_price y
-- discount_pct queda null. Cambia la firma -> se dropea la de 9 args.
-- ----------------------------------------------------------------------------
drop function if exists public.promo_save(bigint, text, text, integer, text, boolean, jsonb, text, jsonb);

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
  v_rid      bigint;
  v_promo_id bigint;
  v_item     jsonb;
  v_grp      jsonb;
  v_pid      bigint;
  v_vid      bigint;
  v_qty      int;
  v_kind     text;
  v_cat      bigint;
  v_min      int;
  v_max      int;
  v_price    int;
  v_pct      int;
begin
  if not public.current_user_is_admin() then raise exception 'No autorizado'; end if;
  v_rid := public.current_user_restaurant_id();
  if v_rid is null then raise exception 'Sin restaurante asociado'; end if;

  v_kind := coalesce(nullif(trim(p_kind), ''), 'fixed');
  if v_kind not in ('fixed', 'build') then raise exception 'Tipo de promoción inválido'; end if;

  if p_name is null or length(trim(p_name)) = 0 then raise exception 'El nombre es obligatorio'; end if;

  if v_kind = 'fixed' then
    if p_promo_price is null or p_promo_price < 0 then raise exception 'Precio de promoción inválido'; end if;
    v_price := p_promo_price;
    v_pct   := null;

    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
      raise exception 'La promoción debe incluir al menos un producto';
    end if;
    if jsonb_array_length(p_items) > 30 then raise exception 'La promoción no puede tener más de 30 productos'; end if;
  else
    if p_discount_pct is null or p_discount_pct < 1 or p_discount_pct > 100 then
      raise exception 'Ingresá un descuento entre 1%% y 100%%';
    end if;
    v_price := 0;          -- el precio del combo se calcula sobre lo elegido
    v_pct   := p_discount_pct;

    if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) < 1 then
      raise exception 'Un combo "arma tu promo" necesita al menos un grupo de elección';
    end if;
    if jsonb_array_length(p_groups) > 15 then raise exception 'Demasiados grupos (máximo 15)'; end if;
  end if;

  if p_id is null then
    insert into public.promotions (restaurant_id, name, description, promo_price, image_url, active, kind, discount_pct)
    values (v_rid, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_price,
            nullif(trim(coalesce(p_image_url, '')), ''), coalesce(p_active, true), v_kind, v_pct)
    returning id into v_promo_id;
  else
    update public.promotions
      set name         = trim(p_name),
          description  = nullif(trim(coalesce(p_description, '')), ''),
          promo_price  = v_price,
          image_url    = nullif(trim(coalesce(p_image_url, '')), ''),
          active       = coalesce(p_active, true),
          kind         = v_kind,
          discount_pct = v_pct,
          updated_at   = now()
      where id = p_id and restaurant_id = v_rid
      returning id into v_promo_id;
    if v_promo_id is null then raise exception 'Promoción no encontrada'; end if;
  end if;

  delete from public.promotion_items  where promotion_id = v_promo_id;
  delete from public.promotion_groups where promotion_id = v_promo_id;

  if v_kind = 'fixed' then
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_pid := (v_item->>'product_id')::bigint;
      v_vid := nullif(v_item->>'variant_id', '')::bigint;
      v_qty := coalesce((v_item->>'quantity')::int, 1);
      if v_qty < 1 or v_qty > 50 then raise exception 'Cantidad inválida en un producto (1-50)'; end if;

      perform 1 from public.products where id = v_pid and restaurant_id = v_rid;
      if not found then raise exception 'Un producto seleccionado no pertenece a tu restaurante'; end if;

      if v_vid is not null then
        perform 1 from public.product_variants where id = v_vid and product_id = v_pid;
        if not found then raise exception 'Una variante no corresponde a su producto'; end if;
      end if;

      insert into public.promotion_items (promotion_id, product_id, variant_id, quantity)
      values (v_promo_id, v_pid, v_vid, v_qty);
    end loop;
  else
    for v_grp in select * from jsonb_array_elements(p_groups)
    loop
      v_cat := (v_grp->>'category_id')::bigint;
      v_min := coalesce((v_grp->>'min_select')::int, 1);
      v_max := coalesce((v_grp->>'max_select')::int, 1);
      if v_min < 0 or v_max < 1 or v_max < v_min or v_max > 20 then
        raise exception 'Rango de selección inválido en un grupo (revisá mín/máx)';
      end if;

      perform 1 from public.categories where id = v_cat and restaurant_id = v_rid;
      if not found then raise exception 'Una categoría del combo no pertenece a tu restaurante'; end if;

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

revoke all on function public.promo_list()                                                              from public, anon;
revoke all on function public.promo_save(bigint, text, text, integer, text, boolean, jsonb, text, jsonb, integer) from public, anon;
grant execute on function public.promo_list()                                                              to authenticated, service_role;
grant execute on function public.promo_save(bigint, text, text, integer, text, boolean, jsonb, text, jsonb, integer) to authenticated, service_role;
