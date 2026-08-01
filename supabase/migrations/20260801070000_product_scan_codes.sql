alter table public.products
  add column if not exists scan_code text;

comment on column public.products.scan_code is
  'Codigo leido por pistola laser/lector de barras para asociar productos desde el panel admin.';

create unique index if not exists products_restaurant_scan_code_unique
  on public.products (restaurant_id, lower(scan_code))
  where scan_code is not null and btrim(scan_code) <> '';
