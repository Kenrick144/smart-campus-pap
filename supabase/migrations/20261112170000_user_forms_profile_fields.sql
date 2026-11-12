-- Smart Campus: campos aprovados para os cinco formulários de utilizador.
-- Aditiva e segura para revisão; não altera registos existentes nem é aplicada automaticamente.
alter table public.users
  add column if not exists nationality text,
  add column if not exists sex text,
  add column if not exists postal_code text,
  add column if not exists locality text,
  add column if not exists administrator_number text,
  add column if not exists academic_degree text,
  add column if not exists disciplinary_area text,
  add column if not exists professional_category text;

alter table public.alunos
  add column if not exists sex text,
  add column if not exists nationality text,
  add column if not exists postal_code text,
  add column if not exists locality text,
  add column if not exists guardian_is_student boolean not null default false,
  add column if not exists guardian_postal_code text,
  add column if not exists guardian_locality text;

-- Campos de identificação e contacto do encarregado permanecem opcionais.
-- A relação "O próprio" é representada por guardian_is_student, sem duplicar
-- dados pessoais do aluno na ficha do encarregado.
