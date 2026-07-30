-- Senal explicita para que los comensales abiertos en el QR salgan a /gracias
-- cuando staff/admin resetea una mesa, incluso si no habia pedidos activos.

alter table public.table_qr_codes
  add column if not exists reset_version bigint not null default 0,
  add column if not exists reset_at timestamptz;

create or replace function public._reset_table_state(p_table_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cart_deleted int := 0;
  v_diners_deleted int := 0;
  v_calls_attended int := 0;
  v_staff_id bigint;
begin
  begin
    v_staff_id := public._current_staff_id();
  exception when others then
    v_staff_id := null;
  end;

  delete from public.table_cart_items where table_id = p_table_id;
  get diagnostics v_cart_deleted = row_count;

  delete from public.table_diners where table_id = p_table_id;
  get diagnostics v_diners_deleted = row_count;

  update public.service_calls
     set status = 'attended',
         attended_at = coalesce(attended_at, now()),
         attended_by = coalesce(attended_by, v_staff_id)
   where table_id = p_table_id
     and status = 'pending';
  get diagnostics v_calls_attended = row_count;

  update public.tables
     set current_waiter_id = null
   where id = p_table_id;

  update public.table_qr_codes q
     set reset_version = reset_version + 1,
         reset_at = now()
    from public.tables t
   where t.id = p_table_id
     and q.id = t.qr_code_id;

  return jsonb_build_object(
    'cart_deleted', v_cart_deleted,
    'diners_deleted', v_diners_deleted,
    'calls_attended', v_calls_attended
  );
end;
$$;

revoke all on function public._reset_table_state(bigint) from public, anon, authenticated;
grant execute on function public._reset_table_state(bigint) to service_role;

create or replace function public.get_table_reset_version_qr(p_qr_token text)
returns bigint
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_reset_version bigint;
begin
  select coalesce(q.reset_version, 0)
    into v_reset_version
  from public.table_qr_codes q
  where q.qr_code = p_qr_token
    and q.qr_active = true
  limit 1;

  if v_reset_version is null then
    raise exception 'Mesa no encontrada o sin QR activo';
  end if;

  return v_reset_version;
end;
$$;

alter function public.get_table_reset_version_qr(text) owner to postgres;
revoke all on function public.get_table_reset_version_qr(text) from public;
grant execute on function public.get_table_reset_version_qr(text) to anon, authenticated, service_role;
