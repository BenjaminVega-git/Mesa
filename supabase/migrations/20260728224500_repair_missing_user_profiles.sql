-- Repara usuarios Auth que quedaron sin perfil public.users.
-- Sin esta fila, el login autentica correctamente pero no puede determinar
-- role_id/restaurant_id y muestra "No se pudo verificar tu cuenta".

insert into public.users (auth_user_id, user_name, user_email, role_id, restaurant_id, must_change_password)
select au.id, split_part(au.email, '@', 1), au.email, 2, 1, false
from auth.users au
where au.email in ('elvega908@gmail.com', 'administracion@cyber-company.cl')
  and not exists (
    select 1
    from public.users u
    where u.auth_user_id = au.id
  );
