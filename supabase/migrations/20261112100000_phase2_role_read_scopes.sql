-- Phase 2 RBAC: safe read scopes for Funcionário and Administrador Adjunto.
-- Prepared for review only. Do not apply until the API/UI contract and tests are approved.

-- Funcionário: global read-only access only to non-sensitive academic/campus catalogues.
-- Personal/student records (users, alunos, presencas, notas, sessoes, temporary codes)
-- deliberately remain excluded from broad direct-table SELECT policies.
DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'anos_letivos',
    'cursos',
    'disciplinas',
    'disciplinas_turmas',
    'turmas',
    'professores',
    'professores_turmas',
    'professores_disciplinas_turmas',
    'horarios',
    'salas',
    'computadores',
    'equipamentos'
  ]
  LOOP
    policy_name := table_name || '_select_funcionario_read_all';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.current_user_role() = %L)',
      policy_name, table_name, 'Funcionário'
    );
  END LOOP;
END
$$;

-- Administrador Adjunto may consult a restricted directory for account management.
-- Do NOT grant SELECT on public.users: it contains fiscal, identity, health and address data.
-- This view exposes only the minimum account directory fields and checks the role itself.
CREATE OR REPLACE VIEW public.users_directory
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  id,
  name,
  email,
  role,
  status,
  username,
  department,
  employee_position,
  professional_status,
  created_at
FROM public.users
WHERE private.current_user_role() IN ('Administrador', 'Administrador Adjunto');

REVOKE ALL ON public.users_directory FROM PUBLIC;
GRANT SELECT ON public.users_directory TO authenticated;

COMMENT ON VIEW public.users_directory IS
  'Safe account directory for Administrador and Administrador Adjunto. Excludes birth date, phone, NIF, identity document, NISS, health number and address.';
