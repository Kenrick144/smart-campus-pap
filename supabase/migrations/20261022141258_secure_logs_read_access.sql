-- Activity logs are visible only to the Administrator and Assistant Administrator.
-- Inserts and updates performed by trusted server routes continue to use the server-only admin client.

drop policy if exists logs_select_admin_or_adjunct on public.logs;

create policy logs_select_admin_or_adjunct
on public.logs
for select
to authenticated
using (
  (select private.current_user_role()) in ('Administrador', 'Administrador Adjunto')
);
