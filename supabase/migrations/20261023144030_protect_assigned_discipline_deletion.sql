create or replace function public.prevent_deleting_assigned_discipline()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if exists (
    select 1
      from public.disciplinas_turmas as dt
     where dt.disciplina_id = old.id
  ) then
    raise exception using
      errcode = '23503',
      message = 'Esta disciplina está associada a uma ou mais turmas. Marca-a como Inativa em vez de a eliminar.';
  end if;

  return old;
end;
$function$;

drop trigger if exists prevent_deleting_assigned_discipline on public.disciplinas;

create trigger prevent_deleting_assigned_discipline
before delete on public.disciplinas
for each row
execute function public.prevent_deleting_assigned_discipline();
