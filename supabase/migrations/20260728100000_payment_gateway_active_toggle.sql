-- Activar/desactivar la pasarela de pago SIN perder las credenciales
-- guardadas (a diferencia de payment_disconnect_account, que las borra de
-- Vault). `active` es independiente de `status`: una cuenta puede estar
-- 'connected' pero pausada (active=false) — el comensal deja de ver el
-- botón de pago en línea y el staff deja de ver el QR de pasarela, pero al
-- reactivar no hay que volver a pegar las credenciales.

alter table public.restaurant_payment_account
  add column if not exists active boolean not null default true;

-- payment_connect_account: toda conexión nueva/actualizada arranca activa.
create or replace function public.payment_connect_account(
  p_provider text,
  p_account_id text,
  p_credentials text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_rid bigint; v_ex record; v_sec uuid; v_sfx text;
begin
  if not public.current_user_is_admin() then raise exception 'No autorizado'; end if;
  if coalesce(trim(p_provider), '') = '' then raise exception 'Falta el proveedor'; end if;
  v_rid := public.current_user_restaurant_id();
  v_sfx := v_rid::text || '_' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;

  select * into v_ex from public.restaurant_payment_account where restaurant_id = v_rid;
  if found and v_ex.credentials_secret_id is not null then
    delete from vault.secrets where id = v_ex.credentials_secret_id;
  end if;

  if coalesce(trim(p_credentials), '') <> '' then
    v_sec := vault.create_secret(p_credentials, 'pay_cred_' || v_sfx, 'Credenciales pasarela de pago');
  end if;

  insert into public.restaurant_payment_account
    (restaurant_id, provider, provider_account_id, credentials_secret_id, status, active, connected_at, updated_at)
  values (v_rid, trim(p_provider), nullif(trim(coalesce(p_account_id, '')), ''), v_sec, 'connected', true, now(), now())
  on conflict (restaurant_id) do update set
    provider = excluded.provider,
    provider_account_id = excluded.provider_account_id,
    credentials_secret_id = excluded.credentials_secret_id,
    status = 'connected',
    active = true,
    connected_at = now(),
    updated_at = now();
end;
$$;

-- Pausar/reactivar: exige que ya exista una conexión (no reemplaza a Conectar).
create or replace function public.payment_set_active(p_active boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_rid bigint; v_status text;
begin
  if not public.current_user_is_admin() then raise exception 'No autorizado'; end if;
  v_rid := public.current_user_restaurant_id();

  select status into v_status from public.restaurant_payment_account where restaurant_id = v_rid;
  if v_status is null then raise exception 'Todavía no conectaste una pasarela de pago'; end if;
  if v_status <> 'connected' then raise exception 'La pasarela no está conectada'; end if;

  update public.restaurant_payment_account
    set active = coalesce(p_active, true), updated_at = now()
  where restaurant_id = v_rid;
end;
$$;

revoke all on function public.payment_set_active(boolean) from public, anon;
grant execute on function public.payment_set_active(boolean) to authenticated, service_role;

-- get_my_payment_account: expone el nuevo flag a la UI.
create or replace function public.get_my_payment_account()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare v_rid bigint; v jsonb;
begin
  if not public.current_user_is_admin() then raise exception 'No autorizado'; end if;
  v_rid := public.current_user_restaurant_id();
  select jsonb_build_object(
    'provider', a.provider,
    'provider_account_id', a.provider_account_id,
    'status', coalesce(a.status, 'disconnected'),
    'active', coalesce(a.active, true),
    'has_credentials', a.credentials_secret_id is not null,
    'connected_at', a.connected_at
  ) into v
  from public.restaurant_payment_account a where a.restaurant_id = v_rid limit 1;
  return coalesce(v, jsonb_build_object('status', 'disconnected', 'active', true, 'has_credentials', false));
end;
$$;

-- Pausado = el comensal deja de ver "Pagar en línea" en el menú QR.
create or replace function public.qr_payment_available(p_qr_token text)
returns text
language sql
stable security definer
set search_path to 'public'
as $$
  select a.provider
  from public.resolve_qr_token(p_qr_token) t
  join public.restaurant_payment_account a on a.restaurant_id = t.restaurant_id
  where a.status = 'connected' and a.active
  limit 1;
$$;

-- Pausado = el staff deja de ver la opción "QR de pago" al cobrar.
create or replace function public.staff_gateway_provider()
returns text
language sql
stable security definer
set search_path to 'public'
as $$
  select a.provider
  from public.restaurant_payment_account a
  join public.users u on u.restaurant_id = a.restaurant_id
  where u.auth_user_id = auth.uid() and a.status = 'connected' and a.active
  limit 1;
$$;

-- payment_gateway_context expone `active` para que las edge functions de
-- CREACIÓN de cobro lo respeten; no se filtra aquí adentro porque esta misma
-- función la usan payment-return/payment-reconcile para CONFIRMAR pagos ya
-- en curso — un pago que ya empezó no debe quedar varado si pausás la
-- pasarela a mitad de camino.
create or replace function public.payment_gateway_context(p_restaurant_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'provider', a.provider,
    'status', a.status,
    'active', coalesce(a.active, true),
    'credentials', case
      when a.credentials_secret_id is not null then
        (select s.decrypted_secret from vault.decrypted_secrets s where s.id = a.credentials_secret_id)
      else null
    end
  ) into v
  from public.restaurant_payment_account a
  where a.restaurant_id = p_restaurant_id;

  return v; -- null si el restaurante no tiene cuenta configurada
end;
$$;
