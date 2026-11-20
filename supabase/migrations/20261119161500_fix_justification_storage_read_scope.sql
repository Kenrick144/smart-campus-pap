-- Qualify storage.objects.name to avoid ambiguity with public.users.name.
drop policy if exists justificacoes_storage_read_authorized on storage.objects;
create policy justificacoes_storage_read_authorized
on storage.objects for select to authenticated
using (
  storage.objects.bucket_id = 'justificacoes-faltas'
  and (
    exists (
      select 1
      from public.presencas p
      join public.users u on u.id = (select auth.uid())
      where p.id::text = (storage.foldername(storage.objects.name))[1]
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
      where p.id::text = (storage.foldername(storage.objects.name))[1]
        and t.professor_coordenador_id = (select auth.uid())
        and u.status = 'Ativo'
        and u.role = 'Professor'
    )
    or exists (
      select 1
      from public.presencas p
      join public.horarios h on h.id = p.horario_id
      join public.users u on u.id = (select auth.uid())
      where p.id::text = (storage.foldername(storage.objects.name))[1]
        and h.professor_id = (select auth.uid())
        and u.status = 'Ativo'
        and u.role = 'Professor'
    )
  )
);
