-- PC Agent: atomic failed-code throttling and guarded session start.
-- Review and apply manually; this file is NOT executed against the active project.

alter table public.pc_device_credentials
  add column if not exists failed_code_attempts integer not null default 0,
  add column if not exists code_locked_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pc_device_credentials'::regclass
      and conname = 'pc_device_credentials_failed_attempts_nonnegative'
  ) then
    alter table public.pc_device_credentials
      add constraint pc_device_credentials_failed_attempts_nonnegative
      check (failed_code_attempts >= 0 and failed_code_attempts <= 5);
  end if;
end $$;

create or replace function public.start_pc_session_guarded(
  p_computador_id uuid,
  p_codigo_hash text,
  p_device_credential_id uuid
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_device public.pc_device_credentials%rowtype;
  v_computador public.computadores%rowtype;
  v_codigo public.codigos_temporarios%rowtype;
  v_codigo_id uuid;
  v_aluno_id uuid;
  v_session_id uuid;
  v_aluno_nome text;
  v_attempts integer;
begin
  -- Serialize all code attempts made through the same registered device.
  select * into v_device
  from public.pc_device_credentials
  where id = p_device_credential_id
    and computador_id = p_computador_id
    and revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'DEVICE_CREDENTIAL_INVALID');
  end if;

  if v_device.code_locked_until is not null and v_device.code_locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'error', 'DEVICE_TEMPORARILY_LOCKED',
      'retry_at', v_device.code_locked_until
    );
  end if;

  -- Expired lockouts are cleared only when a new attempt is made.
  if v_device.code_locked_until is not null and v_device.code_locked_until <= now() then
    update public.pc_device_credentials
      set failed_code_attempts = 0, code_locked_until = null
      where id = p_device_credential_id;
    v_device.failed_code_attempts := 0;
  end if;

  select * into v_computador
  from public.computadores
  where id = p_computador_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'COMPUTER_NOT_FOUND');
  end if;
  if v_computador.estado <> 'Operacional' then
    return jsonb_build_object('ok', false, 'error', 'COMPUTER_NOT_OPERATIONAL');
  end if;

  if p_codigo_hash is null or p_codigo_hash !~ '^[0-9a-f]{64}$' then
    v_attempts := least(v_device.failed_code_attempts + 1, 5);
    update public.pc_device_credentials
      set failed_code_attempts = v_attempts,
          code_locked_until = case when v_attempts >= 5 then now() + interval '10 minutes' else null end
      where id = p_device_credential_id;
    return jsonb_build_object(
      'ok', false,
      'error', case when v_attempts >= 5 then 'DEVICE_TEMPORARILY_LOCKED' else 'INVALID_OR_EXPIRED_CODE' end,
      'attempts_remaining', greatest(5 - v_attempts, 0),
      'retry_at', case when v_attempts >= 5 then now() + interval '10 minutes' else null end
    );
  end if;

  select c.id, c.aluno_id
    into v_codigo_id, v_aluno_id
  from public.codigos_temporarios c
  where c.codigo_hash = p_codigo_hash
    and c.used_at is null
    and c.revoked_at is null
    and c.expires_at > now();

  if not found then
    v_attempts := least(v_device.failed_code_attempts + 1, 5);
    update public.pc_device_credentials
      set failed_code_attempts = v_attempts,
          code_locked_until = case when v_attempts >= 5 then now() + interval '10 minutes' else null end
      where id = p_device_credential_id;
    return jsonb_build_object(
      'ok', false,
      'error', case when v_attempts >= 5 then 'DEVICE_TEMPORARILY_LOCKED' else 'INVALID_OR_EXPIRED_CODE' end,
      'attempts_remaining', greatest(5 - v_attempts, 0),
      'retry_at', case when v_attempts >= 5 then now() + interval '10 minutes' else null end
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_aluno_id::text, 0));

  select c.* into v_codigo
  from public.codigos_temporarios c
  where c.id = v_codigo_id
    and c.codigo_hash = p_codigo_hash
    and c.used_at is null
    and c.revoked_at is null
    and c.expires_at > now()
  for update;

  if not found then
    v_attempts := least(v_device.failed_code_attempts + 1, 5);
    update public.pc_device_credentials
      set failed_code_attempts = v_attempts,
          code_locked_until = case when v_attempts >= 5 then now() + interval '10 minutes' else null end
      where id = p_device_credential_id;
    return jsonb_build_object(
      'ok', false,
      'error', case when v_attempts >= 5 then 'DEVICE_TEMPORARILY_LOCKED' else 'INVALID_OR_EXPIRED_CODE' end,
      'attempts_remaining', greatest(5 - v_attempts, 0),
      'retry_at', case when v_attempts >= 5 then now() + interval '10 minutes' else null end
    );
  end if;

  if not exists (
    select 1 from public.users u
    join public.alunos a on a.id = u.id
    where u.id = v_codigo.aluno_id and u.role = 'Aluno' and u.status = 'Ativo'
  ) then
    return jsonb_build_object('ok', false, 'error', 'STUDENT_NOT_ACTIVE');
  end if;

  if not exists (
    select 1 from public.alunos_turmas at
    where at.aluno_id = v_codigo.aluno_id and at.data_fim is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'STUDENT_NOT_ENROLLED');
  end if;

  update public.sessoes_computador
    set ended_at = now(), ended_reason = 'timeout'
    where ended_at is null and heartbeat_at < now() - interval '2 minutes';

  if exists (
    select 1 from public.sessoes_computador s
    where s.aluno_id = v_codigo.aluno_id and s.ended_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'STUDENT_HAS_ACTIVE_SESSION');
  end if;

  if exists (
    select 1 from public.sessoes_computador s
    where s.computador_id = p_computador_id and s.ended_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'COMPUTER_IN_USE');
  end if;

  insert into public.sessoes_computador (computador_id, aluno_id, codigo_id)
    values (p_computador_id, v_codigo.aluno_id, v_codigo.id)
    returning id into v_session_id;

  update public.codigos_temporarios set used_at = now() where id = v_codigo.id;
  update public.pc_device_credentials
    set failed_code_attempts = 0, code_locked_until = null
    where id = p_device_credential_id;

  select u.name into v_aluno_nome
  from public.users u where u.id = v_codigo.aluno_id;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'aluno_id', v_codigo.aluno_id,
    'aluno_nome', coalesce(v_aluno_nome, 'Aluno'),
    'computador_id', v_computador.id,
    'computador_nome', v_computador.nome,
    'started_at', now()
  );
end;
$function$;

revoke all on function public.start_pc_session_guarded(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.start_pc_session_guarded(uuid, text, uuid) to service_role;
