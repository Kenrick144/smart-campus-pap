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
  v_codigo_id uuid;
  v_aluno_id uuid;
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

  -- Read the owner without locking the code row, then take the student lock.
  -- This keeps the lock order consistent with issue_pc_temporary_code.
  SELECT c.id, c.aluno_id
    INTO v_codigo_id, v_aluno_id
  FROM public.codigos_temporarios c
  WHERE c.codigo_hash = p_codigo_hash
    AND c.used_at IS NULL
    AND c.revoked_at IS NULL
    AND c.expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_OR_EXPIRED_CODE' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_aluno_id::text, 0));

  -- Recheck and lock after obtaining the student-level lock. The code may have
  -- been cancelled or replaced between the first lookup and this point.
  SELECT c.* INTO v_codigo
  FROM public.codigos_temporarios c
  WHERE c.id = v_codigo_id
    AND c.codigo_hash = p_codigo_hash
    AND c.used_at IS NULL
    AND c.revoked_at IS NULL
    AND c.expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_OR_EXPIRED_CODE' USING ERRCODE = 'P0001';
  END IF;

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
