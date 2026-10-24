-- Generate a stable discipline code from the database-generated UUID.
-- The code is not supplied by the client and is preserved on updates.
create or replace function public.auto_generate_discipline_code()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.id is null then
    new.id := pg_catalog.gen_random_uuid();
  end if;

  if new.codigo is null or pg_catalog.length(pg_catalog.btrim(new.codigo)) = 0 then
    new.codigo := 'DISC-' || pg_catalog.upper(
      pg_catalog.replace(new.id::text, '-', '')
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.auto_generate_discipline_code() from public, anon, authenticated;

drop trigger if exists auto_generate_discipline_code on public.disciplinas;

create trigger auto_generate_discipline_code
before insert on public.disciplinas
for each row
execute function public.auto_generate_discipline_code();
