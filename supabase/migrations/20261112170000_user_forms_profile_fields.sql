-- Smart Campus: campos adicionais aprovados para os cinco formulários.
-- Migração aditiva e idempotente. Apenas para revisão; não aplicar sem autorização.
alter table public.users
  add column if not exists sex text,
  add column if not exists nationality text,
  add column if not exists postal_code text,
  add column if not exists locality text,
  add column if not exists administrator_number text,
  add column if not exists academic_degree text,
  add column if not exists disciplinary_area text,
  add column if not exists professional_category text;

alter table public.alunos
  add column if not exists guardian_is_student boolean not null default false;

comment on column public.alunos.guardian_is_student is
  'Indica que o próprio aluno é o encarregado de educação; evita duplicar os seus dados pessoais.';
