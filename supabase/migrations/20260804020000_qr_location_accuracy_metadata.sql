-- Guarda la precisión reportada al capturar las coordenadas del restaurante.
-- Esto permite detectar puntos guardados con un margen GPS demasiado amplio.

alter table public.restaurants
  add column if not exists location_accuracy_m double precision;

alter table public.restaurants
  drop constraint if exists restaurants_location_accuracy_chk;

alter table public.restaurants
  add constraint restaurants_location_accuracy_chk
  check (location_accuracy_m is null or (location_accuracy_m >= 0 and location_accuracy_m <= 10000));
