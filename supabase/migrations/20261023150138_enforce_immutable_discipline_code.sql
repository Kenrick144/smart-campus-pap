-- Enforce the generated code as immutable. Even direct INSERT/UPDATE attempts
-- cannot provide or change a discipline code independently of the record UUID.
create or replace function public.auto_generate_discipline_code()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.codigo := old.codigo;
    return new;
  end if;

  if new.id is null then
    new.id := pg_catalog.gen_random_uuid();
  end if;

  new.codigo := 'DISC-' || pg_catalog.upper(
    pg_catalog.replace(new.id::text, '-', '')
  );

  return new;
end;
$function$;

revoke all on function public.auto_generate_discipline_code() from public, anon, authenticated;

drop trigger if exists auto_generate_discipline_code on public.disciplinas;

create trigger auto_generate_discipline_code
before insert or update of id, codigo on public.disciplinas
for each row
execute function public.auto_generate_discipline_code();
