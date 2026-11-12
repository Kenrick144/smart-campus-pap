-- Phase 2 hardening: device credentials, temporary codes and PC sessions
-- are server-managed only. No browser role should access these tables directly.
-- Service-role backend operations remain unchanged.
REVOKE ALL PRIVILEGES ON TABLE
  public.codigos_temporarios,
  public.pc_device_credentials,
  public.sessoes_computador
FROM PUBLIC, anon, authenticated;
