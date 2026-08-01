-- La propina no debe mostrarse como "1x Propina" en el detalle de productos.
-- Debe mostrarse en el bloque de totales, entre Neto e IVA.

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
        'razon_social', tp.razon_social,
        'giro', tp.giro,
        'direccion', tp.direccion,
        'comuna', tp.comuna,
        'actividad_economica', tp.actividad_economica,
        'logo_url', tp.logo_url
      )
      from public.restaurant_tax_profile tp
      where tp.restaurant_id = s.restaurant_id
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

create or replace function public.get_tax_document_item_detail(p_document_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare v_rid bigint; v_payment_id bigint; v_items jsonb;
begin
  if not public.current_user_is_admin() then raise exception 'No autorizado'; end if;
  v_rid := public.current_user_restaurant_id();

  select payment_id into v_payment_id
  from public.tax_documents
  where id = p_document_id and restaurant_id = v_rid;

  if v_payment_id is null then return '[]'::jsonb; end if;

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
  where o.payment_id = v_payment_id;

  return v_items;
end;
$$;

revoke all on function public.get_tax_document_item_detail(bigint) from public, anon;
grant execute on function public.get_tax_document_item_detail(bigint) to authenticated, service_role;
