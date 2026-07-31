-- Opciones avanzadas libres por producto (checkboxes visibles en menu/POS).

create table if not exists public.product_menu_options (
  id            bigint generated always as identity primary key,
  restaurant_id bigint not null references public.restaurants(id) on delete cascade,
  product_id    bigint not null references public.products(id) on delete cascade,
  name          text not null,
  extra_price   integer not null default 0 check (extra_price >= 0 and extra_price <= 9999999),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  check (char_length(trim(name)) between 1 and 120)
);

alter table public.product_menu_options enable row level security;
revoke all on table public.product_menu_options from anon, authenticated;

create index if not exists product_menu_options_product_idx
  on public.product_menu_options(product_id, sort_order, id);

drop policy if exists "admin reads menu options of own products" on public.product_menu_options;
create policy "admin reads menu options of own products"
on public.product_menu_options for select to authenticated
using (
  public.current_user_is_admin()
  and exists (
    select 1 from public.products p
    where p.id = product_menu_options.product_id
      and p.restaurant_id = public.current_user_restaurant_id()
  )
);

drop policy if exists "admin inserts menu options of own products" on public.product_menu_options;
create policy "admin inserts menu options of own products"
on public.product_menu_options for insert to authenticated
with check (
  public.current_user_is_admin()
  and restaurant_id = public.current_user_restaurant_id()
  and exists (
    select 1 from public.products p
    where p.id = product_menu_options.product_id
      and p.restaurant_id = public.current_user_restaurant_id()
  )
);

drop policy if exists "admin updates menu options of own products" on public.product_menu_options;
create policy "admin updates menu options of own products"
on public.product_menu_options for update to authenticated
using (
  public.current_user_is_admin()
  and exists (
    select 1 from public.products p
    where p.id = product_menu_options.product_id
      and p.restaurant_id = public.current_user_restaurant_id()
  )
)
with check (
  public.current_user_is_admin()
  and restaurant_id = public.current_user_restaurant_id()
  and exists (
    select 1 from public.products p
    where p.id = product_menu_options.product_id
      and p.restaurant_id = public.current_user_restaurant_id()
  )
);

drop policy if exists "admin deletes menu options of own products" on public.product_menu_options;
create policy "admin deletes menu options of own products"
on public.product_menu_options for delete to authenticated
using (
  public.current_user_is_admin()
  and exists (
    select 1 from public.products p
    where p.id = product_menu_options.product_id
      and p.restaurant_id = public.current_user_restaurant_id()
  )
);

alter table public.table_cart_items
  add column if not exists menu_option_choices jsonb;

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
        ),
        'menu_options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',          mo.id,
            'name',        mo.name,
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
        ),
        'menu_options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',          mo.id,
            'name',        mo.name,
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

drop function if exists public.cart_add_item_qr(text, bigint, bigint, integer, text, text, jsonb, text);

create or replace function public.cart_add_item_qr(
  p_qr_token text,
  p_product_id bigint,
  p_variant_id bigint,
  p_quantity integer,
  p_notes text,
  p_added_by text,
  p_ingredient_choices jsonb default null,
  p_menu_option_choices jsonb default null,
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
  v_menu_extra    int := 0;
  v_qty           int;
  v_notes         text;
  v_choices       jsonb;
  v_menu_choices  jsonb;
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

  if p_menu_option_choices is not null and jsonb_typeof(p_menu_option_choices) = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('option_id', mo.id)), null),
           coalesce(sum(mo.extra_price), 0)
      into v_menu_choices, v_menu_extra
    from jsonb_array_elements(p_menu_option_choices) as ch(val)
    join public.product_menu_options mo
      on mo.id = (ch.val->>'option_id')::bigint
      and mo.product_id = p_product_id
      and mo.restaurant_id = v_restaurant_id;
  end if;

  select id into v_existing_id
  from public.table_cart_items
  where table_id = v_table_id
    and product_id = p_product_id
    and variant_id is not distinct from p_variant_id
    and notes is not distinct from v_notes
    and ingredient_choices is not distinct from v_choices
    and menu_option_choices is not distinct from v_menu_choices
    and diner_slot is not distinct from v_diner_slot
  limit 1;

  if v_existing_id is not null then
    update public.table_cart_items
    set quantity = quantity + v_qty
    where id = v_existing_id;
  else
    insert into public.table_cart_items
      (restaurant_id, table_id, product_id, variant_id, unit_price, quantity, notes, added_by,
       ingredient_choices, menu_option_choices, diner_slot, diner_label)
    values
      (v_restaurant_id, v_table_id, p_product_id, p_variant_id,
       v_price + v_extra + v_menu_extra, v_qty, v_notes,
       nullif(left(coalesce(p_added_by, ''), 100), ''), v_choices, v_menu_choices,
       v_diner_slot, v_diner_label);
  end if;
end;
$$;

alter function public.cart_add_item_qr(text, bigint, bigint, integer, text, text, jsonb, jsonb, text) owner to postgres;
revoke all on function public.cart_add_item_qr(text, bigint, bigint, integer, text, text, jsonb, jsonb, text) from public;
grant execute on function public.cart_add_item_qr(text, bigint, bigint, integer, text, text, jsonb, jsonb, text) to anon, authenticated, service_role;

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
    'menu_option_choices', c.menu_option_choices,
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
    'menu_option_labels', case when c.menu_option_choices is null then null else (
      select coalesce(jsonb_agg(
        mo.name || case when mo.extra_price > 0 then ' (+$' || mo.extra_price::text || ')' else '' end
        order by ord
      ), '[]'::jsonb)
      from jsonb_array_elements(c.menu_option_choices) with ordinality as ch(val, ord)
      join public.product_menu_options mo
        on mo.id = (ch.val->>'option_id')::bigint
        and mo.product_id = c.product_id
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

  perform public.rate_limit_check('order:' || v_table_id, 15, 60);
  perform pg_advisory_xact_lock(hashtext('cart-order:' || v_table_id::text));

  if public.is_table_reserved_now(v_table_id) then
    raise exception 'Esta mesa esta reservada en este horario';
  end if;

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
        'menu_option_choices', c.menu_option_choices,
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
      if v_promo_name is null then
        raise exception 'La promocion ya no esta disponible';
      end if;

      v_detail := '';

      if v_promo_kind = 'build' then
        if v_promo_pct is null then
          raise exception 'La promocion "%" ya no esta disponible', v_promo_name;
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
