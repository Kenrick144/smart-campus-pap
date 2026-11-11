-- Smart Campus PC access: temporary student codes, PC sessions and per-device credentials.
CREATE TABLE public.codigos_temporarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  codigo_hash text NOT NULL UNIQUE CHECK (codigo_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT codigos_temporarios_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT codigos_temporarios_single_terminal_state CHECK (used_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX codigos_temporarios_one_open_per_student
  ON public.codigos_temporarios (aluno_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE INDEX codigos_temporarios_student_created_idx
  ON public.codigos_temporarios (aluno_id, created_at DESC);

CREATE TABLE public.sessoes_computador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  computador_id uuid NOT NULL REFERENCES public.computadores(id) ON DELETE RESTRICT,
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE RESTRICT,
  codigo_id uuid NOT NULL UNIQUE REFERENCES public.codigos_temporarios(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_reason text CHECK (ended_reason IS NULL OR ended_reason IN ('aluno', 'administrador', 'timeout', 'desligado', 'erro')),
  CONSTRAINT sessoes_computador_end_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX sessoes_computador_one_active_per_pc
  ON public.sessoes_computador (computador_id)
  WHERE ended_at IS NULL;

CREATE UNIQUE INDEX sessoes_computador_one_active_per_student
  ON public.sessoes_computador (aluno_id)
  WHERE ended_at IS NULL;

CREATE INDEX sessoes_computador_student_started_idx
  ON public.sessoes_computador (aluno_id, started_at DESC);

CREATE INDEX sessoes_computador_pc_started_idx
  ON public.sessoes_computador (computador_id, started_at DESC);

CREATE TABLE public.pc_device_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  computador_id uuid NOT NULL UNIQUE REFERENCES public.computadores(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

ALTER TABLE public.codigos_temporarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_computador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pc_device_credentials ENABLE ROW LEVEL SECURITY;

-- These tables are accessed only by the trusted Next.js server using the secret API key.
-- Students never receive direct table access; ownership is enforced by the API routes.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.codigos_temporarios TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessoes_computador TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pc_device_credentials TO service_role;

CREATE OR REPLACE FUNCTION public.issue_pc_temporary_code(
  p_aluno_id uuid,
  p_codigo_hash text,
  p_expires_at timestamptz
)
RETURNS TABLE(id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_expires_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_aluno_id::text, 0));

  IF p_codigo_hash IS NULL OR p_codigo_hash !~ '^[0-9a-f]{64}$'
     OR p_expires_at <= now() OR p_expires_at > now() + interval '11 minutes' THEN
    RAISE EXCEPTION 'INVALID_CODE_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.alunos a ON a.id = u.id
    WHERE u.id = p_aluno_id AND u.role = 'Aluno' AND u.status = 'Ativo'
  ) THEN
    RAISE EXCEPTION 'STUDENT_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.alunos_turmas at
    WHERE at.aluno_id = p_aluno_id AND at.data_fim IS NULL
  ) THEN
    RAISE EXCEPTION 'STUDENT_NOT_ENROLLED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.sessoes_computador
    SET ended_at = now(), ended_reason = 'timeout'
    WHERE aluno_id = p_aluno_id AND ended_at IS NULL
      AND heartbeat_at < now() - interval '2 minutes';

  IF EXISTS (
    SELECT 1 FROM public.sessoes_computador s
    WHERE s.aluno_id = p_aluno_id AND s.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'STUDENT_HAS_ACTIVE_SESSION' USING ERRCODE = 'P0001';
  END IF;

  IF (
    SELECT count(*) FROM public.codigos_temporarios c
    WHERE c.aluno_id = p_aluno_id AND c.created_at > now() - interval '15 minutes'
  ) >= 5 THEN
    RAISE EXCEPTION 'CODE_RATE_LIMITED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.codigos_temporarios
    SET revoked_at = now()
    WHERE aluno_id = p_aluno_id AND used_at IS NULL AND revoked_at IS NULL;

  INSERT INTO public.codigos_temporarios (aluno_id, codigo_hash, expires_at)
    VALUES (p_aluno_id, p_codigo_hash, p_expires_at)
    RETURNING codigos_temporarios.id, codigos_temporarios.expires_at
      INTO v_id, v_expires_at;

  RETURN QUERY SELECT v_id, v_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_pc_session(
  p_computador_id uuid,
  p_codigo_hash text
)
RETURNS TABLE(
  session_id uuid,
  aluno_id uuid,
  aluno_nome text,
  computador_id uuid,
  computador_nome text,
  started_at timestamptz
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_computador public.computadores%ROWTYPE;
  v_codigo public.codigos_temporarios%ROWTYPE;
  v_session_id uuid;
  v_aluno_nome text;
BEGIN
  SELECT * INTO v_computador
  FROM public.computadores
  WHERE id = p_computador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPUTER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_computador.estado <> 'Operacional' THEN
    RAISE EXCEPTION 'COMPUTER_NOT_OPERATIONAL' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_codigo
  FROM public.codigos_temporarios
  WHERE codigo_hash = p_codigo_hash
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_OR_EXPIRED_CODE' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_codigo.aluno_id::text, 0));

  UPDATE public.sessoes_computador
    SET ended_at = now(), ended_reason = 'timeout'
    WHERE ended_at IS NULL AND heartbeat_at < now() - interval '2 minutes';

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.alunos a ON a.id = u.id
    WHERE u.id = v_codigo.aluno_id AND u.role = 'Aluno' AND u.status = 'Ativo'
  ) THEN
    RAISE EXCEPTION 'STUDENT_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.alunos_turmas at
    WHERE at.aluno_id = v_codigo.aluno_id AND at.data_fim IS NULL
  ) THEN
    RAISE EXCEPTION 'STUDENT_NOT_ENROLLED' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sessoes_computador s
    WHERE s.aluno_id = v_codigo.aluno_id AND s.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'STUDENT_HAS_ACTIVE_SESSION' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sessoes_computador s
    WHERE s.computador_id = p_computador_id AND s.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'COMPUTER_IN_USE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.sessoes_computador (computador_id, aluno_id, codigo_id)
    VALUES (p_computador_id, v_codigo.aluno_id, v_codigo.id)
    RETURNING sessoes_computador.id INTO v_session_id;

  UPDATE public.codigos_temporarios
    SET used_at = now()
    WHERE id = v_codigo.id;

  SELECT u.name INTO v_aluno_nome
  FROM public.users u
  WHERE u.id = v_codigo.aluno_id;

  RETURN QUERY
    SELECT v_session_id, v_codigo.aluno_id, COALESCE(v_aluno_nome, 'Aluno'),
           v_computador.id, v_computador.nome, now();
END;
$$;

REVOKE ALL ON FUNCTION public.issue_pc_temporary_code(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_pc_session(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_pc_temporary_code(uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_pc_session(uuid, text) TO service_role;
