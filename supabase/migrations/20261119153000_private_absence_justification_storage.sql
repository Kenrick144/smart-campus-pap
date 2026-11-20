insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('justificacoes-faltas', 'justificacoes-faltas', false, 10485760,
        array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists justificacoes_storage_upload_own on storage.objects;
create policy justificacoes_storage_upload_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'justificacoes-faltas'
  and exists (
    select 1 from public.presencas p
    where p.id::text = (storage.foldername(name))[1]
      and p.aluno_id = (select auth.uid())
      and p.estado = 'Falta'
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
      where p.id::text = (storage.foldername(name))[1]
        and p.aluno_id = (select auth.uid())
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
      where p.id::text = (storage.foldername(name))[1]
        and t.professor_coordenador_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.presencas p
      join public.horarios h on h.id = p.horario_id
      where p.id::text = (storage.foldername(name))[1]
        and h.professor_id = (select auth.uid())
    )
  )
);