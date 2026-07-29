-- Perfil minimo para login.
-- Evita que una carrera/RLS en el select directo a public.users deje al
-- usuario autenticado sin poder determinar su portal.

create or replace function public.get_my_role_id()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.role_id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;
$$;

alter function public.get_my_role_id() owner to postgres;
revoke all on function public.get_my_role_id() from public, anon;
grant execute on function public.get_my_role_id() to authenticated, service_role;
