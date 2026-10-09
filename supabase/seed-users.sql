-- Criar utilizadores de exemplo no Supabase Auth manualmente e depois associar os perfis aqui.
-- Substitui os IDs abaixo pelos IDs reais gerados pelo Supabase.

insert into public.profiles (id, full_name, email, role)
values
  ('00000000-0000-0000-0000-000000000001', 'Alexandra Costa', 'admin@smartcampus.pt', 'Administrador'),
  ('00000000-0000-0000-0000-000000000002', 'Maria Santos', 'professor@smartcampus.pt', 'Professor'),
  ('00000000-0000-0000-0000-000000000003', 'João Silva', 'aluno@smartcampus.pt', 'Aluno'),
  ('00000000-0000-0000-0000-000000000004', 'Carlos Almeida', 'funcionario@smartcampus.pt', 'Funcionário')
on conflict (email) do update
set full_name = excluded.full_name,
    role = excluded.role;
