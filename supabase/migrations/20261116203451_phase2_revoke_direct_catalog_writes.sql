-- Phase 2: remove direct DML privileges from exposed client roles.
-- Application mutations for these resources go through authenticated server APIs,
-- which validate active profile and role before using the service-role client.
-- Keep SELECT grants; RLS policies continue to control visible rows.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE
  public.anos_letivos,
  public.computadores,
  public.disciplinas,
  public.equipamentos,
  public.salas
FROM anon, authenticated;
