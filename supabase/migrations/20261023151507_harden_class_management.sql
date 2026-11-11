-- Harden class data and preserve history when classes are already in use.
alter table public.turmas
  add constraint turmas_nome_nao_vazio_check
  check (length(btrim(nome)) > 0);

alter table public.turmas
  add constraint turmas_ano_escolar_nao_vazio_check
  check (length(btrim(ano_escolar)) > 0);

alter table public.turmas
  add constraint turmas_curso_nao_vazio_check
  check (length(btrim(curso)) > 0);

create unique index if not exists turmas_identidade_ano_uidx
  on public.turmas (
    ano_letivo_id,
    lower(btrim(curso)),
    lower(btrim(ano_escolar)),
    lower(btrim(nome))
  );

create or replace function public.prevent_deleting_class_with_history()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if exists (select 1 from public.alunos_turmas where turma_id = old.id)
     or exists (select 1 from public.disciplinas_turmas where turma_id = old.id)
     or exists (select 1 from public.professores_turmas where turma_id = old.id)
     or exists (select 1 from public.horarios where turma_id = old.id) then
    raise exception using
      errcode = '23503',
      message = 'Esta turma já tem alunos, disciplinas, professores ou horários associados. Marca-a como Inativa em vez de a eliminar.';
  end if;

  return old;
end;
$function$;

revoke all on function public.prevent_deleting_class_with_history() from public, anon, authenticated;

drop trigger if exists prevent_deleting_class_with_history on public.turmas;

create trigger prevent_deleting_class_with_history
before delete on public.turmas
for each row
execute function public.prevent_deleting_class_with_history();
