-- Validacion opcional por GPS para pedidos hechos desde QR de mesa.
-- Delivery/pedidos online no usan estas RPC, por lo que quedan fuera.

alter table public.restaurants
  add column if not exists location_check_enabled boolean not null default false,
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision,
  add column if not exists location_radius_m integer not null default 120;

alter table public.restaurants
  drop constraint if exists restaurants_location_latitude_chk,
  drop constraint if exists restaurants_location_longitude_chk,
  drop constraint if exists restaurants_location_radius_chk,
  drop constraint if exists restaurants_location_enabled_chk;

alter table public.restaurants
  add constraint restaurants_location_latitude_chk
    check (location_latitude is null or location_latitude between -90 and 90),
  add constraint restaurants_location_longitude_chk
    check (location_longitude is null or location_longitude between -180 and 180),
  add constraint restaurants_location_radius_chk
    check (location_radius_m between 30 and 1000),
  add constraint restaurants_location_enabled_chk
    check (
      location_check_enabled = false
      or (location_latitude is not null and location_longitude is not null)
    );

create or replace function public.qr_order_location_required(p_qr_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table record;
  v_required boolean;
begin
  select * into v_table from public.resolve_qr_token(p_qr_token);

  if v_table.table_id is null then
    raise exception 'QR no valido';
  end if;

  select coalesce(r.location_check_enabled, false)
    into v_required
  from public.restaurants r
  where r.id = v_table.restaurant_id;

  return coalesce(v_required, false);
end;
$$;

alter function public.qr_order_location_required(text) owner to postgres;
revoke all on function public.qr_order_location_required(text) from public;
grant execute on function public.qr_order_location_required(text) to anon, authenticated, service_role;

create or replace function public._assert_qr_order_location(
  p_qr_token text,
  p_latitude double precision,
  p_longitude double precision
) returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table record;
  v_restaurant record;
  v_distance_m double precision;
begin
  select * into v_table from public.resolve_qr_token(p_qr_token);

  if v_table.table_id is null then
    raise exception 'Mesa no encontrada o sin QR activo';
  end if;

  select
    coalesce(r.location_check_enabled, false) as enabled,
    r.location_latitude as latitude,
    r.location_longitude as longitude,
    coalesce(r.location_radius_m, 120) as radius_m
  into v_restaurant
  from public.restaurants r
  where r.id = v_table.restaurant_id;

  if not coalesce(v_restaurant.enabled, false) then
    return;
  end if;

  if v_restaurant.latitude is null or v_restaurant.longitude is null then
    raise exception 'El restaurante no tiene ubicacion configurada';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'Necesitamos tu ubicacion GPS para enviar pedidos desde esta mesa';
  end if;

  if p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Ubicacion GPS invalida';
  end if;

  v_distance_m :=
    6371000 * acos(
      least(
        1,
        greatest(
          -1,
          sin(radians(v_restaurant.latitude)) * sin(radians(p_latitude))
          + cos(radians(v_restaurant.latitude)) * cos(radians(p_latitude))
          * cos(radians(p_longitude - v_restaurant.longitude))
        )
      )
    );

  if v_distance_m > v_restaurant.radius_m then
    raise exception 'Estas demasiado lejos del local para enviar pedidos desde esta mesa';
  end if;
end;
$$;

alter function public._assert_qr_order_location(text, double precision, double precision) owner to postgres;
revoke all on function public._assert_qr_order_location(text, double precision, double precision) from public;
grant execute on function public._assert_qr_order_location(text, double precision, double precision) to anon, authenticated, service_role;

do $$
begin
  if to_regprocedure('public._create_public_orders_from_cart_qr_unchecked(text,text,text)') is null
     and to_regprocedure('public.create_public_orders_from_cart_qr(text,text,text)') is not null then
    alter function public.create_public_orders_from_cart_qr(text, text, text)
      rename to _create_public_orders_from_cart_qr_unchecked;
  end if;
end;
$$;

create or replace function public.create_public_orders_from_cart_qr(
  p_qr_token    text,
  p_diner_token text default null,
  p_coupon_code text default null,
  p_latitude    double precision default null,
  p_longitude   double precision default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._assert_qr_order_location(p_qr_token, p_latitude, p_longitude);
  return public._create_public_orders_from_cart_qr_unchecked(p_qr_token, p_diner_token, p_coupon_code);
end;
$$;

alter function public.create_public_orders_from_cart_qr(text, text, text, double precision, double precision) owner to postgres;
revoke all on function public.create_public_orders_from_cart_qr(text, text, text, double precision, double precision) from public;
grant execute on function public.create_public_orders_from_cart_qr(text, text, text, double precision, double precision) to anon, authenticated, service_role;

revoke all on function public._create_public_orders_from_cart_qr_unchecked(text, text, text) from public, anon, authenticated;
grant execute on function public._create_public_orders_from_cart_qr_unchecked(text, text, text) to service_role;

do $$
begin
  if to_regprocedure('public._create_public_order_qr_unchecked(text,jsonb,text,text)') is null
     and to_regprocedure('public.create_public_order_qr(text,jsonb,text,text)') is not null then
    alter function public.create_public_order_qr(text, jsonb, text, text)
      rename to _create_public_order_qr_unchecked;
  end if;
end;
$$;

create or replace function public.create_public_order_qr(
  p_qr_token    text,
  p_items       jsonb,
  p_diner_token text default null,
  p_coupon_code text default null,
  p_latitude    double precision default null,
  p_longitude   double precision default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._assert_qr_order_location(p_qr_token, p_latitude, p_longitude);
  return public._create_public_order_qr_unchecked(p_qr_token, p_items, p_diner_token, p_coupon_code);
end;
$$;

alter function public.create_public_order_qr(text, jsonb, text, text, double precision, double precision) owner to postgres;
revoke all on function public.create_public_order_qr(text, jsonb, text, text, double precision, double precision) from public;
grant execute on function public.create_public_order_qr(text, jsonb, text, text, double precision, double precision) to anon, authenticated, service_role;

revoke all on function public._create_public_order_qr_unchecked(text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public._create_public_order_qr_unchecked(text, jsonb, text, text) to service_role;
