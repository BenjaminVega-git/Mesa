-- Grupos de promo con opciones especificas de productos.
-- Si un grupo no tiene filas aqui, mantiene el comportamiento anterior:
-- sus opciones son todos los productos disponibles de su categoria.

create table if not exists public.promotion_group_options (
  id          bigint generated always as identity primary key,
  group_id    bigint not null references public.promotion_groups(id) on delete cascade,
  product_id  bigint not null references public.products(id) on delete cascade,
  sort_order  integer not null default 0,
  unique (group_id, product_id)
);

create index if not exists idx_promotion_group_options_group
  on public.promotion_group_options (group_id);
create index if not exists idx_promotion_group_options_product
  on public.promotion_group_options (product_id);

alter table public.promotion_group_options enable row level security;
revoke all on public.promotion_group_options from anon, authenticated;

create or replace function public._promotion_group_eligible_products(
  p_group_id bigint,
  p_restaurant_id bigint
) returns table(product_id bigint, min_price numeric)
language sql stable security definer set search_path = public
as $$
  select p.id,
         coalesce(vmin.min_variant_price, p.product_price)::numeric as min_price
  from public.promotion_groups g
  join public.products p
    on p.restaurant_id = p_restaurant_id
   and p.status_id = 1
   and (
     (
       exists (select 1 from public.promotion_group_options go where go.group_id = g.id)
       and exists (
         select 1
         from public.promotion_group_options go
         where go.group_id = g.id
           and go.product_id = p.id
       )
     )
     or (
       not exists (select 1 from public.promotion_group_options go where go.group_id = g.id)
       and p.category_id = g.category_id
     )
   )
  left join lateral (
    select min(pv.variant_price) as min_variant_price
    from public.product_variants pv
    where pv.product_id = p.id
  ) vmin on true
  where g.id = p_group_id
$$;

revoke all on function public._promotion_group_eligible_products(bigint, bigint)
  from public, anon, authenticated;

create or replace function public._validate_build_selections(
  p_promotion_id  bigint,
  p_restaurant_id bigint,
  p_selections    jsonb
) returns void
language plpgsql stable security definer set search_path = public
as $$
declare
  v_grp   record;
  v_sel   jsonb;
  v_count int;
  v_pid   bigint;
  v_vid   bigint;
  v_gid   bigint;
begin
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' then
    raise exception 'Faltan las elecciones del combo';
  end if;
  if jsonb_array_length(p_selections) > 50 then
    raise exception 'Demasiadas elecciones en el combo';
  end if;

  for v_sel in select * from jsonb_array_elements(p_selections)
  loop
    v_gid := (v_sel->>'group_id')::bigint;
    v_pid := (v_sel->>'product_id')::bigint;
    v_vid := nullif(v_sel->>'variant_id', '')::bigint;

    perform 1
    from public.promotion_groups g
    join public.products p
      on p.id = v_pid
     and p.restaurant_id = p_restaurant_id
     and p.status_id = 1
     and (
       (
         exists (select 1 from public.promotion_group_options go where go.group_id = g.id)
         and exists (
           select 1
           from public.promotion_group_options go
           where go.group_id = g.id
             and go.product_id = p.id
         )
       )
       or (
         not exists (select 1 from public.promotion_group_options go where go.group_id = g.id)
         and p.category_id = g.category_id
       )
     )
    where g.id = v_gid
      and g.promotion_id = p_promotion_id;
    if not found then
      raise exception 'Una eleccion del combo no es valida o no esta disponible';
    end if;

    if v_vid is not null then
      perform 1 from public.product_variants where id = v_vid and product_id = v_pid;
      if not found then raise exception 'Una variante elegida no corresponde al producto'; end if;
    end if;
  end loop;

  for v_grp in
    select g.id, g.name, g.min_select, g.max_select
    from public.promotion_groups g
    where g.promotion_id = p_promotion_id
  loop
    select count(*) into v_count
    from jsonb_array_elements(p_selections) s
    where (s->>'group_id')::bigint = v_grp.id;

    if v_count < v_grp.min_select or v_count > v_grp.max_select then
      if v_grp.min_select = v_grp.max_select then
        raise exception 'En "%": elegi % opcion(es)', v_grp.name, v_grp.min_select;
      else
        raise exception 'En "%": elegi entre % y % opciones', v_grp.name, v_grp.min_select, v_grp.max_select;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public._validate_build_selections(bigint, bigint, jsonb)
  from public, anon, authenticated;

create or replace function public._promotion_min_price(
  p_promotion_id bigint
) returns integer
language sql stable security definer set search_path = public
as $$
  with promo as (
    select pr.*
    from public.promotions pr
    where pr.id = p_promotion_id
  ),
  subtotal as (
    select (
      case when promo.kind = 'mixed' then coalesce((
        select sum(coalesce(pv.variant_price, p.product_price) * pi.quantity)
        from public.promotion_items pi
        join public.products p on p.id = pi.product_id
        left join public.product_variants pv on pv.id = pi.variant_id
        where pi.promotion_id = promo.id
      ), 0) else 0 end
      +
      coalesce((
        select sum(coalesce(gm.min_cost, 0) * g.min_select)
        from public.promotion_groups g
        cross join lateral (
          select min(ep.min_price) as min_cost
          from public._promotion_group_eligible_products(g.id, promo.restaurant_id) ep
        ) gm
        where g.promotion_id = promo.id
      ), 0)
    )::numeric as total
    from promo
  )
  select greatest(
    0,
    round(subtotal.total)::int - least(
      round(subtotal.total)::int,
      case
        when coalesce(promo.discount_type, 'percent') = 'amount' then coalesce(promo.discount_amount, 0)
        else round(subtotal.total * coalesce(promo.discount_pct, 0) / 100.0)::int
      end
    )
  )
  from promo, subtotal
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
      (
        (coalesce(pr.discount_type, 'percent') = 'percent' and pr.discount_pct is not null)
        or (pr.discount_type = 'amount' and coalesce(pr.discount_amount, 0) > 0)
      )
      and exists (select 1 from public.promotion_groups g where g.promotion_id = pr.id)
      and not exists (
        select 1
        from public.promotion_groups g
        where g.promotion_id = pr.id
          and (
            select count(*)
            from public._promotion_group_eligible_products(g.id, pr.restaurant_id)
          ) < g.min_select
      )
    when pr.kind = 'mixed' then
      (
        (coalesce(pr.discount_type, 'percent') = 'percent' and pr.discount_pct is not null)
        or (pr.discount_type = 'amount' and coalesce(pr.discount_amount, 0) > 0)
      )
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
            from public._promotion_group_eligible_products(g.id, pr.restaurant_id)
          ) < g.min_select
      )
    else false
  end
  from public.promotions pr
  where pr.id = p_promotion_id
$$;

revoke all on function public._promotion_available(bigint) from public, anon, authenticated;

create or replace function public._promotion_payload(
  p_promotion public.promotions
) returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id',              p_promotion.id,
    'kind',            p_promotion.kind,
    'name',            p_promotion.name,
    'description',     p_promotion.description,
    'promo_price',     p_promotion.promo_price,
    'discount_type',   coalesce(p_promotion.discount_type, 'percent'),
    'discount_pct',    p_promotion.discount_pct,
    'discount_amount', p_promotion.discount_amount,
    'image_url',       p_promotion.image_url,
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
        'id',                 g.id,
        'name',               g.name,
        'category_id',        g.category_id,
        'option_product_ids', (
          select coalesce(jsonb_agg(go.product_id order by go.sort_order, go.id), '[]'::jsonb)
          from public.promotion_group_options go
          where go.group_id = g.id
        ),
        'min_select',         g.min_select,
        'max_select',         g.max_select
      ) order by g.sort_order, g.id), '[]'::jsonb)
      from public.promotion_groups g
      where g.promotion_id = p_promotion.id
    )
  )
$$;

revoke all on function public._promotion_payload(public.promotions)
  from public, anon, authenticated;

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
      'id',              pr.id,
      'kind',            pr.kind,
      'name',            pr.name,
      'description',     pr.description,
      'promo_price',     pr.promo_price,
      'discount_type',   coalesce(pr.discount_type, 'percent'),
      'discount_pct',    pr.discount_pct,
      'discount_amount', pr.discount_amount,
      'image_url',       pr.image_url,
      'active',          pr.active,
      'sort_order',      pr.sort_order,
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
          'id',                 g.id,
          'name',               g.name,
          'category_id',        g.category_id,
          'category_name',      c.category_name,
          'option_product_ids', (
            select coalesce(jsonb_agg(go.product_id order by go.sort_order, go.id), '[]'::jsonb)
            from public.promotion_group_options go
            where go.group_id = g.id
          ),
          'min_select',         g.min_select,
          'max_select',         g.max_select,
          'sort_order',         g.sort_order,
          'available_count',    (
            select count(*)
            from public._promotion_group_eligible_products(g.id, v_rid)
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

revoke all on function public.promo_list() from public, anon;
grant execute on function public.promo_list() to authenticated, service_role;

create or replace function public.promo_save(
  p_id              bigint,
  p_name            text,
  p_description     text,
  p_promo_price     integer,
  p_image_url       text,
  p_active          boolean,
  p_items           jsonb,
  p_kind            text,
  p_groups          jsonb,
  p_discount_pct    integer,
  p_discount_type   text default 'percent',
  p_discount_amount integer default null
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_rid            bigint;
  v_promo_id       bigint;
  v_item           jsonb;
  v_grp            jsonb;
  v_opt            jsonb;
  v_pid            bigint;
  v_vid            bigint;
  v_qty            int;
  v_kind           text;
  v_cat            bigint;
  v_min            int;
  v_max            int;
  v_price          int;
  v_pct            int;
  v_discount_type  text;
  v_amount         int;
  v_group_id       bigint;
  v_option_count   int;
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
    v_discount_type := 'percent';
    v_pct := null;
    v_amount := null;
  else
    v_discount_type := coalesce(nullif(trim(p_discount_type), ''), 'percent');
    if v_discount_type not in ('percent', 'amount') then raise exception 'Tipo de descuento invalido'; end if;
    if v_discount_type = 'percent' then
      if p_discount_pct is null or p_discount_pct < 1 or p_discount_pct > 100 then
        raise exception 'Ingresa un descuento entre 1%% y 100%%';
      end if;
      v_pct := p_discount_pct;
      v_amount := null;
    else
      if p_discount_amount is null or p_discount_amount < 1 then
        raise exception 'Ingresa un monto fijo de descuento mayor a 0';
      end if;
      v_pct := null;
      v_amount := p_discount_amount;
    end if;
    v_price := 0;
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
    insert into public.promotions
      (restaurant_id, name, description, promo_price, image_url, active, kind, discount_type, discount_pct, discount_amount)
    values
      (v_rid, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_price,
       nullif(trim(coalesce(p_image_url, '')), ''), coalesce(p_active, true), v_kind,
       v_discount_type, v_pct, v_amount)
    returning id into v_promo_id;
  else
    update public.promotions
      set name = trim(p_name),
          description = nullif(trim(coalesce(p_description, '')), ''),
          promo_price = v_price,
          image_url = nullif(trim(coalesce(p_image_url, '')), ''),
          active = coalesce(p_active, true),
          kind = v_kind,
          discount_type = v_discount_type,
          discount_pct = v_pct,
          discount_amount = v_amount,
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
      where c.id = v_cat
      returning id into v_group_id;

      if jsonb_typeof(v_grp->'option_product_ids') = 'array' then
        v_option_count := 0;
        for v_opt in select * from jsonb_array_elements(v_grp->'option_product_ids')
        loop
          v_pid := (v_opt #>> '{}')::bigint;

          perform 1 from public.products where id = v_pid and restaurant_id = v_rid;
          if not found then raise exception 'Un producto de opciones no pertenece a tu restaurante'; end if;

          insert into public.promotion_group_options (group_id, product_id, sort_order)
          values (v_group_id, v_pid, v_option_count)
          on conflict (group_id, product_id) do nothing;
          v_option_count := v_option_count + 1;
        end loop;

        if v_option_count > 0 and v_option_count < v_min then
          raise exception 'Un grupo no tiene suficientes productos especificos para su minimo';
        end if;
      end if;
    end loop;
  end if;

  return v_promo_id;
end;
$$;

revoke all on function public.promo_save(bigint, text, text, integer, text, boolean, jsonb, text, jsonb, integer, text, integer) from public, anon;
grant execute on function public.promo_save(bigint, text, text, integer, text, boolean, jsonb, text, jsonb, integer, text, integer) to authenticated, service_role;
