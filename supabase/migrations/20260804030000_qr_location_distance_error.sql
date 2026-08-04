-- Incluye en el rechazo por geolocalizacion la distancia calculada y el
-- limite efectivo usado por la validacion, para poder diagnosticar el GPS.

create or replace function public.create_public_orders_from_cart_qr(
  p_qr_token    text,
  p_diner_token text default null,
  p_coupon_code text default null,
  p_latitude    double precision default null,
  p_longitude   double precision default null,
  p_accuracy_m  double precision default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table record;
  v_restaurant record;
  v_distance_m double precision;
  v_allowed_m double precision;
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

  if coalesce(v_restaurant.enabled, false) then
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
      6371000 * acos(least(1, greatest(-1,
        sin(radians(v_restaurant.latitude)) * sin(radians(p_latitude))
        + cos(radians(v_restaurant.latitude)) * cos(radians(p_latitude))
        * cos(radians(p_longitude - v_restaurant.longitude))
      )));

    v_allowed_m := v_restaurant.radius_m + least(
      greatest(coalesce(p_accuracy_m, 0), 0),
      v_restaurant.radius_m
    );

    if v_distance_m > v_allowed_m then
      raise exception 'Estas demasiado lejos del local: distancia aproximada % m (limite permitido % m)',
        round(v_distance_m)::integer, round(v_allowed_m)::integer;
    end if;
  end if;

  return public._create_public_orders_from_cart_qr_unchecked(p_qr_token, p_diner_token, p_coupon_code);
end;
$$;

alter function public.create_public_orders_from_cart_qr(text, text, text, double precision, double precision, double precision) owner to postgres;
revoke all on function public.create_public_orders_from_cart_qr(text, text, text, double precision, double precision, double precision) from public;
grant execute on function public.create_public_orders_from_cart_qr(text, text, text, double precision, double precision, double precision) to anon, authenticated, service_role;

create or replace function public.create_public_order_qr(
  p_qr_token    text,
  p_items       jsonb,
  p_diner_token text default null,
  p_coupon_code text default null,
  p_latitude    double precision default null,
  p_longitude   double precision default null,
  p_accuracy_m  double precision default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table record;
  v_restaurant record;
  v_distance_m double precision;
  v_allowed_m double precision;
begin
  select * into v_table from public.resolve_qr_token(p_qr_token);
  if v_table.table_id is null then raise exception 'Mesa no encontrada o sin QR activo'; end if;

  select coalesce(r.location_check_enabled, false) as enabled,
         r.location_latitude as latitude,
         r.location_longitude as longitude,
         coalesce(r.location_radius_m, 120) as radius_m
    into v_restaurant
    from public.restaurants r where r.id = v_table.restaurant_id;

  if coalesce(v_restaurant.enabled, false) then
    if v_restaurant.latitude is null or v_restaurant.longitude is null then raise exception 'El restaurante no tiene ubicacion configurada'; end if;
    if p_latitude is null or p_longitude is null then raise exception 'Necesitamos tu ubicacion GPS para enviar pedidos desde esta mesa'; end if;
    v_distance_m := 6371000 * acos(least(1, greatest(-1,
      sin(radians(v_restaurant.latitude)) * sin(radians(p_latitude))
      + cos(radians(v_restaurant.latitude)) * cos(radians(p_latitude))
      * cos(radians(p_longitude - v_restaurant.longitude))
    )));
    v_allowed_m := v_restaurant.radius_m + least(greatest(coalesce(p_accuracy_m, 0), 0), v_restaurant.radius_m);
    if v_distance_m > v_allowed_m then
      raise exception 'Estas demasiado lejos del local: distancia aproximada % m (limite permitido % m)',
        round(v_distance_m)::integer, round(v_allowed_m)::integer;
    end if;
  end if;

  return public._create_public_order_qr_unchecked(p_qr_token, p_items, p_diner_token, p_coupon_code);
end;
$$;

alter function public.create_public_order_qr(text, jsonb, text, text, double precision, double precision, double precision) owner to postgres;
revoke all on function public.create_public_order_qr(text, jsonb, text, text, double precision, double precision, double precision) from public;
grant execute on function public.create_public_order_qr(text, jsonb, text, text, double precision, double precision, double precision) to anon, authenticated, service_role;
