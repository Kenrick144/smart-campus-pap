-- Courses are first-class entities shared by multiple classes.
create table if not exists public.cursos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  estado text not null default 'Ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cursos_nome_nao_vazio_check check (length(btrim(nome)) > 0),
  constraint cursos_estado_check check (estado in ('Ativo', 'Inativo'))
);

create unique index if not exists cursos_nome_normalizado_uidx
  on public.cursos (lower(btrim(nome)));

alter table public.cursos enable row level security;
revoke all on public.cursos from anon, authenticated;
grant all on public.cursos to service_role;

-- Add a real FK while keeping the legacy text column for older readers.
alter table public.turmas add column if not exists curso_id uuid;

insert into public.cursos (nome, estado)
select min(btrim(curso)), 'Ativo'
from public.turmas
where nullif(btrim(curso), '') is not null
group by lower(btrim(curso))
on conflict do nothing;

update public.turmas t
set curso_id = c.id
from public.cursos c
where lower(btrim(t.curso)) = lower(btrim(c.nome))
  and t.curso_id is null;

do $migration$
begin
  if exists (select 1 from public.turmas where curso_id is null) then
    raise exception 'Não foi possível associar todas as turmas existentes a um curso. Corrige os cursos antes de continuar.';
  end if;
end;
$migration$;

alter table public.turmas alter column curso_id set not null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.turmas'::regclass and conname = 'turmas_curso_id_fkey'
  ) then
    alter table public.turmas
      add constraint turmas_curso_id_fkey
      foreign key (curso_id) references public.cursos(id) on delete restrict;
  end if;
end;
$migration$;

create or replace function public.sync_class_course_name()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_course public.cursos%rowtype;
begin
  select * into v_course from public.cursos where id = new.curso_id;
  if not found then
    raise exception using errcode = '23503', message = 'O curso selecionado não existe.';
  end if;

  new.curso := v_course.nome;
  return new;
end;
$function$;

revoke all on function public.sync_class_course_name() from public, anon, authenticated;

drop trigger if exists sync_class_course_name on public.turmas;
create trigger sync_class_course_name
before insert or update of curso_id on public.turmas
for each row execute function public.sync_class_course_name();

create or replace function public.sync_course_name_to_classes()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.nome is distinct from old.nome then
    update public.turmas set curso = new.nome where curso_id = new.id;
  end if;
  return new;
end;
$function$;

revoke all on function public.sync_course_name_to_classes() from public, anon, authenticated;
drop trigger if exists sync_course_name_to_classes on public.cursos;
create trigger sync_course_name_to_classes
after update of nome on public.cursos
for each row execute function public.sync_course_name_to_classes();

-- Existing class/discipline links are retained as history when removed from a class.
alter table public.disciplinas_turmas
  add column if not exists ativa boolean not null default true;

-- Single transactional operation to create/edit a class and synchronize its disciplines.
create or replace function public.save_class_with_disciplines(
  p_class_id uuid,
  p_nome text,
  p_ano_letivo_id uuid,
  p_ano_escolar text,
  p_curso_id uuid,
  p_capacidade integer,
  p_estado text,
  p_professor_coordenador_id uuid,
  p_disciplina_ids uuid[]
)
returns public.turmas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_class public.turmas%rowtype;
  v_existing public.turmas%rowtype;
  v_year public.anos_letivos%rowtype;
  v_course public.cursos%rowtype;
  v_teacher public.professores%rowtype;
  v_account public.users%rowtype;
  v_discipline_ids uuid[] := coalesce(p_disciplina_ids, '{}'::uuid[]);
  v_valid_count integer;
  v_changed_year boolean := false;
  v_changed_course boolean := false;
  v_changed_teacher boolean := false;
begin
  if nullif(btrim(p_nome), '') is null then
    raise exception 'Introduz o nome da turma.';
  end if;
  if nullif(btrim(p_ano_escolar), '') is null then
    raise exception 'Introduz o ano escolar.';
  end if;
  if p_capacidade is null or p_capacidade < 1 or p_capacidade > 500 then
    raise exception 'A capacidade deve ser um número inteiro entre 1 e 500.';
  end if;
  if p_estado not in ('Ativa', 'Inativa') then
    raise exception 'O estado da turma deve ser Ativa ou Inativa.';
  end if;
  if cardinality(v_discipline_ids) = 0 then
    raise exception 'Seleciona pelo menos uma disciplina para a turma.';
  end if;

  select count(*) into v_valid_count
  from public.disciplinas d
  where d.id = any(v_discipline_ids) and d.estado = 'Ativa';
  if v_valid_count <> cardinality(v_discipline_ids) then
    raise exception 'Uma ou mais disciplinas selecionadas já não estão ativas. Atualiza a página e tenta novamente.';
  end if;

  if p_class_id is not null then
    select * into v_existing from public.turmas where id = p_class_id for update;
    if not found then raise exception 'A turma que pretendes editar não existe.'; end if;
    v_changed_year := v_existing.ano_letivo_id is distinct from p_ano_letivo_id;
    v_changed_course := v_existing.curso_id is distinct from p_curso_id;
    v_changed_teacher := v_existing.professor_coordenador_id is distinct from p_professor_coordenador_id;

    if v_changed_year and (
      exists (select 1 from public.alunos_turmas at where at.turma_id = p_class_id)
      or exists (select 1 from public.horarios h where h.turma_id = p_class_id)
      or exists (select 1 from public.professores_turmas pt where pt.turma_id = p_class_id)
      or exists (select 1 from public.disciplinas_turmas dt where dt.turma_id = p_class_id)
    ) then
      raise exception 'Esta turma já tem histórico associado. Usa «Reutilizar noutro ano letivo» para criar uma nova turma sem alterar o histórico.';
    end if;
  end if;

  select * into v_year from public.anos_letivos where id = p_ano_letivo_id;
  if not found then raise exception 'O ano letivo selecionado não existe.'; end if;
  if v_year.ativo is not true and (p_class_id is null or v_changed_year) then
    raise exception 'Só podes criar ou reutilizar turmas no ano letivo ativo.';
  end if;

  select * into v_course from public.cursos where id = p_curso_id;
  if not found then raise exception 'Seleciona um curso válido.'; end if;
  if v_course.estado <> 'Ativo' and (p_class_id is null or v_changed_course) then
    raise exception 'Só podes atribuir um curso ativo a uma nova turma.';
  end if;

  if p_professor_coordenador_id is not null then
    select * into v_teacher from public.professores where id = p_professor_coordenador_id;
    if not found then raise exception 'O professor coordenador selecionado não existe.'; end if;
    if p_class_id is null or v_changed_teacher then
      if v_teacher.professional_status <> 'Ativo' then
        raise exception 'Seleciona um professor com situação profissional ativa.';
      end if;
      select * into v_account from public.users where id = p_professor_coordenador_id;
      if not found or v_account.status <> 'Ativo' then
        raise exception 'Seleciona um professor com conta ativa.';
      end if;
    end if;
  end if;

  if p_class_id is null then
    insert into public.turmas (
      nome, ano_letivo_id, ano_escolar, curso, curso_id, capacidade,
      estado, professor_coordenador_id
    )
    values (
      btrim(p_nome), p_ano_letivo_id, btrim(p_ano_escolar), v_course.nome,
      p_curso_id, p_capacidade, p_estado, p_professor_coordenador_id
    )
    returning * into v_class;
  else
    update public.turmas
       set nome = btrim(p_nome),
           ano_letivo_id = p_ano_letivo_id,
           ano_escolar = btrim(p_ano_escolar),
           curso = v_course.nome,
           curso_id = p_curso_id,
           capacidade = p_capacidade,
           estado = p_estado,
           professor_coordenador_id = p_professor_coordenador_id,
           updated_at = pg_catalog.now()
     where id = p_class_id
    returning * into v_class;
  end if;

  update public.disciplinas_turmas
     set ativa = false, updated_at = pg_catalog.now()
   where turma_id = v_class.id
     and ativa is true
     and not (disciplina_id = any(v_discipline_ids));

  insert into public.disciplinas_turmas (disciplina_id, turma_id, ativa)
  select selected.disciplina_id, v_class.id, true
  from (select distinct unnest(v_discipline_ids) as disciplina_id) selected
  on conflict (disciplina_id, turma_id)
  do update set ativa = true, updated_at = pg_catalog.now();

  return v_class;
end;
$function$;

revoke all on function public.save_class_with_disciplines(uuid,text,uuid,text,uuid,integer,text,uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.save_class_with_disciplines(uuid,text,uuid,text,uuid,integer,text,uuid,uuid[]) to service_role;
