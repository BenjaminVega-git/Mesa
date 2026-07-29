-- Corrige la cuenta elvega908@gmail.com si quedo asociada a un restaurante
-- ajeno. El criterio es que su restaurante actual no la tenga como owner.

do $$
declare
  v_user_id bigint;
  v_current_restaurant_id bigint;
  v_owner_user_id bigint;
  v_restaurant_id bigint;
begin
  select u.id, u.restaurant_id, r.owner_user_id
    into v_user_id, v_current_restaurant_id, v_owner_user_id
  from public.users u
  left join public.restaurants r on r.id = u.restaurant_id
  where u.user_email = 'elvega908@gmail.com'
    and u.role_id = 2
  limit 1;

  if v_user_id is not null and (v_current_restaurant_id is null or v_owner_user_id is distinct from v_user_id) then
    insert into public.restaurants (restaurant_name, restaurant_logo)
    values ('Restaurante elvega908', null)
    returning id into v_restaurant_id;

    update public.users
    set restaurant_id = v_restaurant_id
    where id = v_user_id;

    update public.restaurants
    set owner_user_id = v_user_id
    where id = v_restaurant_id;
  end if;
end;
$$;
