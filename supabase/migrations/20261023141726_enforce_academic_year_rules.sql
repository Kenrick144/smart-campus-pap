-- Keep academic-year records valid and ensure the school has at most one active year.
alter table public.anos_letivos
  add constraint anos_letivos_nome_nao_vazio_check
  check (length(btrim(nome)) > 0);

create unique index if not exists anos_letivos_nome_normalizado_uidx
  on public.anos_letivos (lower(btrim(nome)));

create unique index if not exists anos_letivos_uma_ativa_uidx
  on public.anos_letivos ((ativo))
  where ativo is true;

create or replace function public.keep_single_active_academic_year()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.ativo is true then
    update public.anos_letivos as existing
       set ativo = false,
           updated_at = pg_catalog.now()
     where existing.id is distinct from new.id
       and existing.ativo is true;
  end if;

  return new;
end;
$function$;

revoke all on function public.keep_single_active_academic_year() from public, anon, authenticated;

drop trigger if exists keep_single_active_academic_year on public.anos_letivos;

create trigger keep_single_active_academic_year
before insert or update of ativo on public.anos_letivos
for each row
execute function public.keep_single_active_academic_year();
