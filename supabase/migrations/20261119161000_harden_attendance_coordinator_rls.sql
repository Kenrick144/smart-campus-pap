-- Restrict attendance coordinator/teacher access to active profiles with the expected role.
drop policy if exists justificacoes_coordenador_select on public.justificacoes_faltas;
create policy justificacoes_coordenador_select
on public.justificacoes_faltas for select to authenticated
using (
  exists (
    select 1
    from public.presencas p
    join public.horarios h on h.id = p.horario_id
    join public.turmas t on t.id = h.turma_id
    join public.users u on u.id = (select auth.uid())
    where p.id = justificacoes_faltas.presenca_id
      and t.professor_coordenador_id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role = 'Professor'
  )
);

drop policy if exists justificacoes_staff_decide on public.justificacoes_faltas;
create policy justificacoes_staff_decide
on public.justificacoes_faltas for update to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role in ('Administrador','Administrador Adjunto')
  )
  or exists (
    select 1
    from public.presencas p
    join public.horarios h on h.id = p.horario_id
    join public.turmas t on t.id = h.turma_id
    join public.users u on u.id = (select auth.uid())
    where p.id = justificacoes_faltas.presenca_id
      and t.professor_coordenador_id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role = 'Professor'
  )
)
with check (
  estado in ('Aceite','Rejeitada')
  and decidido_por = (select auth.uid())
  and decidido_em is not null
  and exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.status = 'Ativo'
      and (
        u.role in ('Administrador','Administrador Adjunto')
        or (
          u.role = 'Professor'
          and exists (
            select 1
            from public.presencas p
            join public.horarios h on h.id = p.horario_id
            join public.turmas t on t.id = h.turma_id
            where p.id = justificacoes_faltas.presenca_id
              and t.professor_coordenador_id = (select auth.uid())
          )
        )
      )
  )
);

drop policy if exists justificacoes_historico_select_coordenador on public.justificacoes_faltas_historico;
create policy justificacoes_historico_select_coordenador
on public.justificacoes_faltas_historico for select to authenticated
using (
  exists (
    select 1
    from public.justificacoes_faltas j
    join public.presencas p on p.id = j.presenca_id
    join public.horarios h on h.id = p.horario_id
    join public.turmas t on t.id = h.turma_id
    join public.users u on u.id = (select auth.uid())
    where j.id = justificacoes_faltas_historico.justificacao_id
      and t.professor_coordenador_id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role = 'Professor'
  )
);

drop policy if exists justificacoes_historico_select_teacher on public.justificacoes_faltas_historico;
create policy justificacoes_historico_select_teacher
on public.justificacoes_faltas_historico for select to authenticated
using (
  exists (
    select 1
    from public.justificacoes_faltas j
    join public.presencas p on p.id = j.presenca_id
    join public.horarios h on h.id = p.horario_id
    join public.users u on u.id = (select auth.uid())
    where j.id = justificacoes_faltas_historico.justificacao_id
      and h.professor_id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role = 'Professor'
  )
);

drop policy if exists presencas_select_coordenador on public.presencas;
create policy presencas_select_coordenador
on public.presencas for select to authenticated
using (
  exists (
    select 1
    from public.horarios h
    join public.turmas t on t.id = h.turma_id
    join public.users u on u.id = (select auth.uid())
    where h.id = presencas.horario_id
      and t.professor_coordenador_id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role = 'Professor'
  )
);

drop policy if exists justificacoes_storage_read_authorized on storage.objects;
create policy justificacoes_storage_read_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'justificacoes-faltas'
  and (
    exists (
      select 1 from public.presencas p
      join public.users u on u.id = (select auth.uid())
      where p.id::text = (storage.foldername(name))[1]
        and p.aluno_id = (select auth.uid())
        and u.status = 'Ativo'
        and u.role = 'Aluno'
    )
    or exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and u.status = 'Ativo'
        and u.role in ('Administrador','Administrador Adjunto','Funcionário')
    )
    or exists (
      select 1
      from public.presencas p
      join public.horarios h on h.id = p.horario_id
      join public.turmas t on t.id = h.turma_id
      join public.users u on u.id = (select auth.uid())
      where p.id::text = (storage.foldername(name))[1]
        and t.professor_coordenador_id = (select auth.uid())
        and u.status = 'Ativo'
        and u.role = 'Professor'
    )
    or exists (
      select 1
      from public.presencas p
      join public.horarios h on h.id = p.horario_id
      join public.users u on u.id = (select auth.uid())
      where p.id::text = (storage.foldername(name))[1]
        and h.professor_id = (select auth.uid())
        and u.status = 'Ativo'
        and u.role = 'Professor'
    )
  )
);
