-- Aisla perfiles reparados que fueron asociados temporalmente al restaurante 1.
-- Estas cuentas venian de auth.users sin fila en public.users; asociarlas a un
-- restaurante existente desbloqueaba el login, pero tambien exponia datos de
-- ese restaurante (productos/categorias/mesas). Cada cuenta queda con su propio
-- restaurante vacio y como owner del mismo.

do $$
declare
  v_email text;
  v_user_id bigint;
  v_restaurant_id bigint;
begin
  foreach v_email in array array['elvega908@gmail.com', 'administracion@cyber-company.cl']
  loop
    select u.id
      into v_user_id
    from public.users u
    where u.user_email = v_email
      and u.role_id = 2
      and u.restaurant_id = 1
    limit 1;

    if v_user_id is not null then
      insert into public.restaurants (restaurant_name, restaurant_logo)
      values (
        'Restaurante ' || split_part(v_email, '@', 1),
        null
      )
      returning id into v_restaurant_id;

      update public.users
      set restaurant_id = v_restaurant_id
      where id = v_user_id;

      update public.restaurants
      set owner_user_id = v_user_id
      where id = v_restaurant_id;
    end if;
  end loop;
end;
$$;
