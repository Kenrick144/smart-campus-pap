-- Keep the role helper out of the exposed public schema.
-- It is called by RLS policies and only authenticated users may execute it.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select u.role
  from public.users as u
  where u.id = (select auth.uid())
  limit 1;
$function$;

revoke all on function private.current_user_role() from public, anon;
grant execute on function private.current_user_role() to authenticated;

drop policy if exists users_select_own_or_admin on public.users;

create policy users_select_own_or_admin
on public.users
for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.current_user_role()) = 'Administrador'
);

drop function if exists public.current_user_role();
