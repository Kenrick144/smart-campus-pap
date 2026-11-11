-- Fix the active assignment function to use the PostgreSQL GREATEST expression.
-- Recreate from the canonical migration so fresh installs and the active database agree.


create unique index if not exists alunos_turmas_uma_turma_ativa_por_aluno
  on public.alunos_turmas (aluno_id)
  where data_fim is null;

create or replace function public.assign_student_to_class(
  p_student_id uuid,
  p_turma_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := pg_catalog.timezone('Europe/Lisbon', pg_catalog.now())::date;
  v_student_id uuid;
  v_class record;
  v_current record;
  v_history_id uuid;
  v_active_count integer;
begin
  select a.id
    into v_student_id
    from public.alunos as a
    join public.users as u on u.id = a.id
   where a.id = p_student_id
     and u.role = 'Aluno'
     and u.status = 'Ativo'
   for update of a;

  if not found then
    raise exception 'O aluno não existe ou a conta não está ativa.';
  end if;

  select t.id, t.nome, t.capacidade, t.estado, y.nome as ano_letivo, y.ativo as ano_letivo_ativo
    into v_class
    from public.turmas as t
    join public.anos_letivos as y on y.id = t.ano_letivo_id
   where t.id = p_turma_id
   for update of t;

  if not found then
    raise exception 'A turma selecionada não existe.';
  end if;

  if v_class.estado <> 'Ativa' then
    raise exception 'Não é possível associar alunos a uma turma inativa.';
  end if;

  if v_class.ano_letivo_ativo is distinct from true then
    raise exception 'A turma não pertence a um ano letivo ativo. Ativa o ano letivo correto antes de continuar.';
  end if;

  select m.id, m.turma_id, m.data_inicio
    into v_current
    from public.alunos_turmas as m
   where m.aluno_id = p_student_id
     and m.data_fim is null
   order by m.data_inicio desc
   limit 1
   for update;

  if found and v_current.turma_id = p_turma_id then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'changed', false,
      'message', 'O aluno já está associado a esta turma.',
      'className', v_class.nome
    );
  end if;

  select count(*)::integer
    into v_active_count
    from public.alunos_turmas as m
   where m.turma_id = p_turma_id
     and m.data_fim is null;

  if v_active_count >= v_class.capacidade then
    raise exception 'A turma selecionada já atingiu a capacidade máxima.';
  end if;

  update public.alunos_turmas as m
     set data_fim = GREATEST(v_today, m.data_inicio)
   where m.aluno_id = p_student_id
     and m.data_fim is null;

  select m.id
    into v_history_id
    from public.alunos_turmas as m
   where m.aluno_id = p_student_id
     and m.turma_id = p_turma_id
     and m.data_inicio = v_today
     and m.data_fim is not null
   order by m.created_at desc
   limit 1
   for update;

  if found then
    update public.alunos_turmas
       set data_fim = null
     where id = v_history_id;
  else
    insert into public.alunos_turmas (aluno_id, turma_id, data_inicio, data_fim)
    values (p_student_id, p_turma_id, v_today, null);
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'changed', true,
    'message', 'Turma associada com sucesso. O histórico anterior foi preservado.',
    'className', v_class.nome,
    'academicYear', v_class.ano_letivo
  );
exception
  when unique_violation then
    raise exception 'O aluno já tem uma turma ativa ou a associação foi alterada em simultâneo. Atualiza a página e tenta novamente.';
end;
$function$;

revoke all on function public.assign_student_to_class(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_student_to_class(uuid, uuid) to service_role;
