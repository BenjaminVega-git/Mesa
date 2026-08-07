-- Cobros presenciales: transferencia y pagos mixtos.
-- El pago sigue siendo una sola venta/boleta, y payment_parts conserva cuánto
-- se recibió por cada medio para caja, contabilidad y auditoría.

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check
  check (method in ('online', 'cash', 'card', 'transfer', 'mixed'));

create table if not exists public.payment_parts (
  id bigint generated always as identity primary key,
  payment_id bigint not null references public.payments(id) on delete cascade,
  method text not null check (method in ('cash', 'card', 'transfer')),
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_payment_parts_payment on public.payment_parts(payment_id);
alter table public.payment_parts enable row level security;
revoke all on table public.payment_parts from anon, authenticated;

drop function if exists public.staff_register_payment(bigint, text, integer, integer, bigint, bigint[]);
create or replace function public.staff_register_payment(
  p_table_id bigint,
  p_method text,
  p_tip integer default 0,
  p_diner_slot integer default null,
  p_order_id bigint default null,
  p_order_ids bigint[] default null,
  p_cash_amount integer default null,
  p_card_amount integer default null,
  p_transfer_amount integer default null
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  s record; v_table record; v_ids bigint[]; v_amount integer; v_max_id bigint;
  v_tip integer; v_pid bigint; v_remaining int; v_released boolean := false;
  v_cash int := greatest(0, coalesce(p_cash_amount, 0));
  v_card int := greatest(0, coalesce(p_card_amount, 0));
  v_transfer int := greatest(0, coalesce(p_transfer_amount, 0));
  v_parts_total int;
begin
  select * into s from public._charge_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;
  if p_method not in ('cash', 'card', 'transfer', 'mixed') then raise exception 'Método de pago inválido'; end if;
  v_tip := greatest(0, coalesce(p_tip, 0));
  if v_tip > 1000000 then raise exception 'Propina fuera de rango'; end if;

  select id, restaurant_id, table_number into v_table from public.tables where id = p_table_id;
  if v_table.id is null or v_table.restaurant_id <> s.restaurant_id then raise exception 'Mesa no encontrada'; end if;

  select array_agg(o.id), coalesce(sum(o.total), 0), max(o.id) into v_ids, v_amount, v_max_id
  from (
    select id, total from public.orders
    where table_id = p_table_id and status_id in (1, 2, 3)
      and (p_diner_slot is null or diner_slot = p_diner_slot)
      and (p_order_id is null or id = p_order_id)
      and (p_order_ids is null or id = any(p_order_ids))
    for update
  ) o;
  if v_ids is null then raise exception 'La mesa no tiene pedidos activos'; end if;
  if p_order_ids is not null and array_length(v_ids, 1) <> array_length(p_order_ids, 1) then
    raise exception 'Algunos pedidos de la selección ya no están activos';
  end if;
  if v_amount <= 0 then raise exception 'La cuenta está en $0'; end if;

  if p_method = 'cash' then v_cash := v_amount + v_tip; v_card := 0; v_transfer := 0;
  elsif p_method = 'card' then v_card := v_amount + v_tip; v_cash := 0; v_transfer := 0;
  elsif p_method = 'transfer' then v_transfer := v_amount + v_tip; v_cash := 0; v_card := 0;
  end if;
  v_parts_total := v_cash + v_card + v_transfer;
  if v_parts_total <> v_amount + v_tip or (p_method = 'mixed' and v_parts_total = 0) then
    raise exception 'El desglose de pagos debe sumar %', v_amount + v_tip;
  end if;

  insert into public.payments (restaurant_id, table_id, order_ids, provider, method, amount, tip, currency, status, paid_at)
  values (s.restaurant_id, p_table_id, v_ids, null, p_method, v_amount, v_tip, 'CLP', 'paid', now())
  returning id into v_pid;
  if v_cash > 0 then insert into public.payment_parts(payment_id, method, amount) values (v_pid, 'cash', v_cash); end if;
  if v_card > 0 then insert into public.payment_parts(payment_id, method, amount) values (v_pid, 'card', v_card); end if;
  if v_transfer > 0 then insert into public.payment_parts(payment_id, method, amount) values (v_pid, 'transfer', v_transfer); end if;

  update public.orders set status_id = 4, payment_id = v_pid, paid_by = s.user_id where id = any(v_ids);
  if v_tip > 0 then update public.orders set tip_amount = v_tip where id = v_max_id; end if;
  select count(*) into v_remaining from public.orders where table_id = p_table_id and status_id in (1, 2, 3);
  if v_remaining = 0 then perform public._reset_table_state(p_table_id); v_released := true; end if;

  return jsonb_build_object('payment_id', v_pid, 'amount', v_amount, 'tip', v_tip,
    'paid_ids', to_jsonb(v_ids), 'table_released', v_released, 'table_number', v_table.table_number);
end;
$$;
revoke all on function public.staff_register_payment(bigint, text, integer, integer, bigint, bigint[], integer, integer, integer) from public, anon;
grant execute on function public.staff_register_payment(bigint, text, integer, integer, bigint, bigint[], integer, integer, integer) to authenticated, service_role;

create or replace function public._payment_parts_json(p_id bigint)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('method', method, 'amount', amount) order by id), '[]'::jsonb)
  from public.payment_parts where payment_id = p_id;
$$;

create or replace function public.get_my_payment(p_payment_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare s record; v jsonb;
begin
  select * into s from public._support_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;
  select jsonb_build_object('id', p.id, 'status', p.status, 'method', p.method, 'provider', p.provider,
    'amount', p.amount, 'tip', p.tip, 'parts', public._payment_parts_json(p.id), 'table_number', t.table_number,
    'paid_at', p.paid_at, 'boleta', (select jsonb_build_object('id', d.id, 'folio', d.folio, 'sii_status', d.sii_status)
      from public.tax_documents d where d.payment_id = p.id and d.doc_type in (39, 41) and not coalesce(d.voided, false)
      order by d.id desc limit 1)) into v
  from public.payments p left join public.tables t on t.id = p.table_id
  where p.id = p_payment_id and p.restaurant_id = s.restaurant_id;
  return v;
end;
$$;

create or replace function public.list_my_payments_today()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare s record; v jsonb;
begin
  select * into s from public._support_current_staff();
  if s.user_id is null then raise exception 'No autorizado'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'table_number', t.table_number, 'amount', p.amount,
    'tip', p.tip, 'status', p.status, 'method', p.method, 'provider', p.provider, 'parts', public._payment_parts_json(p.id),
    'created_at', p.created_at, 'paid_at', p.paid_at, 'boleta', (select jsonb_build_object('id', d.id, 'folio', d.folio, 'sii_status', d.sii_status)
      from public.tax_documents d where d.payment_id = p.id and d.doc_type in (39, 41) and not coalesce(d.voided, false)
      order by d.id desc limit 1)) order by p.created_at desc), '[]'::jsonb) into v
  from public.payments p left join public.tables t on t.id = p.table_id
  where p.restaurant_id = s.restaurant_id and p.created_at >= ((now() at time zone 'America/Santiago')::date)::timestamp at time zone 'America/Santiago';
  return v;
end;
$$;

do $$ declare fn text; begin
  for fn in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('_payment_parts_json','get_my_payment','list_my_payments_today')
  loop execute format('revoke all on function %s from public, anon', fn); execute format('grant execute on function %s to authenticated, service_role', fn); end loop;
end $$;
