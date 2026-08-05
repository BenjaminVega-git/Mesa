-- Usa el nombre configurado del restaurante cuando el nombre tributario
-- todavía no está informado. Así la boleta no muestra un nombre genérico.

create or replace function public.get_payment_receipt(p_payment_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare s record; v jsonb; v_items jsonb; v_tip integer; v_total integer; v_net integer; v_iva integer;
begin
  select * into s from public._support_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;

  select coalesce(p.tip, 0), p.amount + coalesce(p.tip, 0)
    into v_tip, v_total
  from public.payments p
  where p.id = p_payment_id and p.restaurant_id = s.restaurant_id;

  v_total := coalesce(v_total, 0);
  v_net := round(v_total::numeric / 1.19)::integer;
  v_iva := v_total - v_net;

  select coalesce(jsonb_agg(jsonb_build_object(
      'name', oi.product_name,
      'variant_name', oi.variant_name,
      'quantity', oi.product_quantity,
      'unit_price', oi.product_price,
      'line_total', oi.product_price * oi.product_quantity
    ) order by oi.id), '[]'::jsonb)
    into v_items
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.payment_id = p_payment_id;

  select jsonb_build_object(
    'doc', to_jsonb(d) || jsonb_build_object('net', v_net, 'iva', v_iva, 'total', v_total, 'tip', coalesce(v_tip, 0)),
    'items', v_items,
    'emisor', (
      select jsonb_build_object(
        'rut', tp.rut,
        'razon_social', coalesce(nullif(trim(tp.razon_social), ''), r.restaurant_name, 'Nombre del restaurante'),
        'giro', tp.giro,
        'direccion', tp.direccion,
        'comuna', tp.comuna,
        'actividad_economica', tp.actividad_economica,
        'logo_url', tp.logo_url
      )
      from public.restaurants r
      left join public.restaurant_tax_profile tp on tp.restaurant_id = r.id
      where r.id = s.restaurant_id
    )
  ) into v
  from public.tax_documents d
  join public.payments p on p.id = d.payment_id
  where d.payment_id = p_payment_id
    and p.restaurant_id = s.restaurant_id
    and d.doc_type in (39, 41)
    and not coalesce(d.voided, false)
  order by d.id desc limit 1;

  return v;
end;
$$;
