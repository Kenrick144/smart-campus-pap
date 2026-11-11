-- Smart Campus PC Agent: align the Windows Agent session start with
-- computer-bound QR codes and persist the five-failure / ten-minute lockout.
-- Review manually before applying to the active Supabase project.

alter table public.pc_device_credentials
  add column if not exists failed_code_attempts integer not null default 0,
  add column if not exists code_locked_until timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pc_device_credentials'::regclass
      and conname = 'pc_device_credentials_failed_attempts_nonnegative'
  ) then
    alter table public.pc_device_credentials
      add constraint pc_device_credentials_failed_attempts_nonnegative
      check (failed_code_attempts >= 0 and failed_code_attempts <= 5);
  end if;
end
$$;

create or replace function public.pc_agent_start_session_guarded(
  p_computador_id uuid,
  p_code_hash text,
  p_agent_key_hash text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_device public.pc_device_credentials%rowtype;
  v_computador public.computadores%rowtype;
  v_codigo public.codigos_temporarios%rowtype;
  v_user public.users%rowtype;
  v_session_id uuid;
  v_attempts integer;
  v_retry_at timestamptz;
begin
  -- Serialize all attempts for this device and verify its individual secret.
  select *
    into v_device
  from public.pc_device_credentials d
  where d.computador_id = p_computador_id
    and d.token_hash = p_agent_key_hash
    and d.revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'INVALID_DEVICE_CREDENTIAL');
  end if;

  if v_device.code_locked_until is not null and v_device.code_locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'error', 'DEVICE_TEMPORARILY_LOCKED',
      'retry_at', v_device.code_locked_until
    );
  end if;

  if v_device.code_locked_until is not null and v_device.code_locked_until <= now() then
    update public.pc_device_credentials
      set failed_code_attempts = 0,
          code_locked_until = null
      where id = v_device.id;
    v_device.failed_code_attempts := 0;
    v_device.code_locked_until := null;
  end if;

  select *
    into v_computador
  from public.computadores c
  where c.id = p_computador_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'COMPUTER_NOT_FOUND');
  end if;

  if v_computador.estado <> 'Operacional' then
    return jsonb_build_object('ok', false, 'error', 'COMPUTER_NOT_AVAILABLE');
  end if;

  -- Invalid or malformed hashes count as attempts just like an incorrect code.
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    v_attempts := least(coalesce(v_device.failed_code_attempts, 0) + 1, 5);
    v_retry_at := case when v_attempts >= 5 then now() + interval '10 minutes' else null end;
    update public.pc_device_credentials
      set failed_code_attempts = v_attempts,
          code_locked_until = v_retry_at
      where id = v_device.id;
    return jsonb_build_object(
      'ok', false,
      'error', case when v_attempts >= 5 then 'DEVICE_TEMPORARILY_LOCKED' else 'INVALID_OR_EXPIRED_CODE_FOR_COMPUTER' end,
      'attempts_remaining', greatest(5 - v_attempts, 0),
      'retry_at', v_retry_at
    );
  end if;

  -- The QR-bound code must belong to this exact computer.
  select *
    into v_codigo
  from public.codigos_temporarios c
  where c.codigo_hash = p_code_hash
    and c.computador_id = p_computador_id
    and c.used_at is null
    and c.revoked_at is null
    and c.expires_at > now()
  for update;

  if not found then
    v_attempts := least(coalesce(v_device.failed_code_attempts, 0) + 1, 5);
    v_retry_at := case when v_attempts >= 5 then now() + interval '10 minutes' else null end;
    update public.pc_device_credentials
      set failed_code_attempts = v_attempts,
          code_locked_until = v_retry_at
      where id = v_device.id;
    return jsonb_build_object(
      'ok', false,
      'error', case when v_attempts >= 5 then 'DEVICE_TEMPORARILY_LOCKED' else 'INVALID_OR_EXPIRED_CODE_FOR_COMPUTER' end,
      'attempts_remaining', greatest(5 - v_attempts, 0),
      'retry_at', v_retry_at
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_codigo.user_id::text, 0));

  -- Re-read under row lock after acquiring the per-user lock to prevent reuse.
  select *
    into v_codigo
  from public.codigos_temporarios c
  where c.id = v_codigo.id
    and c.codigo_hash = p_code_hash
    and c.computador_id = p_computador_id
    and c.used_at is null
    and c.revoked_at is null
    and c.expires_at > now()
  for update;

  if not found then
    v_attempts := least(coalesce(v_device.failed_code_attempts, 0) + 1, 5);
    v_retry_at := case when v_attempts >= 5 then now() + interval '10 minutes' else null end;
    update public.pc_device_credentials
      set failed_code_attempts = v_attempts,
          code_locked_until = v_retry_at
      where id = v_device.id;
    return jsonb_build_object(
      'ok', false,
      'error', case when v_attempts >= 5 then 'DEVICE_TEMPORARILY_LOCKED' else 'INVALID_OR_EXPIRED_CODE_FOR_COMPUTER' end,
      'attempts_remaining', greatest(5 - v_attempts, 0),
      'retry_at', v_retry_at
    );
  end if;

  select *
    into v_user
  from public.users u
  where u.id = v_codigo.user_id
    and u.status = 'Ativo'
    and u.role in ('Aluno', 'Professor', 'Funcionário');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'USER_NOT_ALLOWED');
  end if;

  if v_user.role = 'Aluno' and (
    not exists (select 1 from public.alunos a where a.id = v_user.id)
    or not exists (
      select 1
      from public.alunos_turmas at
      where at.aluno_id = v_user.id and at.data_fim is null
    )
  ) then
    return jsonb_build_object('ok', false, 'error', 'STUDENT_NOT_ENROLLED');
  elsif v_user.role = 'Professor' and not exists (
    select 1
    from public.professores p
    where p.id = v_user.id and p.professional_status = 'Ativo'
  ) then
    return jsonb_build_object('ok', false, 'error', 'TEACHER_NOT_ACTIVE');
  elsif v_user.role = 'Funcionário' and not exists (
    select 1
    from public.funcionarios f
    where f.id = v_user.id and f.professional_status = 'Ativo'
  ) then
    return jsonb_build_object('ok', false, 'error', 'STAFF_NOT_ACTIVE');
  end if;

  -- Close stale sessions before enforcing one active session per user/device.
  update public.sessoes_computador
    set ended_at = now(), ended_reason = 'timeout'
  where ended_at is null
    and heartbeat_at < now() - interval '2 minutes';

  if exists (
    select 1
    from public.sessoes_computador s
    where s.user_id = v_user.id and s.ended_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'USER_HAS_ACTIVE_SESSION');
  end if;

  if exists (
    select 1
    from public.sessoes_computador s
    where s.computador_id = p_computador_id and s.ended_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'COMPUTER_IN_USE');
  end if;

  insert into public.sessoes_computador
    (computador_id, aluno_id, user_id, codigo_id)
  values
    (
      p_computador_id,
      case when v_user.role = 'Aluno' then v_user.id else null end,
      v_user.id,
      v_codigo.id
    )
  returning id into v_session_id;

  update public.codigos_temporarios
    set used_at = now()
  where id = v_codigo.id;

  update public.pc_device_credentials
    set last_seen_at = now(),
        failed_code_attempts = 0,
        code_locked_until = null
  where id = v_device.id;

  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'session_id', v_session_id,
      'user_id', v_user.id,
      'user_name', coalesce(v_user.name, 'Utilizador'),
      'user_role', v_user.role,
      'computador_id', v_computador.id,
      'computador_nome', v_computador.nome,
      'started_at', now()
    )
  );
end;
$function$;

revoke all on function public.pc_agent_start_session_guarded(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.pc_agent_start_session_guarded(uuid, text, text)
  to service_role;


-- Keep the legacy /api/pc/device student endpoint compatible with the new
-- user_id/computador_id columns and enforce the same physical-computer binding.
create or replace function public.start_pc_session_guarded(
  p_computador_id uuid,
  p_codigo_hash text,
  p_device_credential_id uuid
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
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
  v_retry_at timestamptz;
begin
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
    return jsonb_build_object('ok', false, 'error', 'DEVICE_TEMPORARILY_LOCKED',
      'attempts_remaining', 0, 'retry_at', v_device.code_locked_until);
  end if;

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
    v_attempts := least(coalesce(v_device.failed_code_attempts, 0) + 1, 5);
    v_retry_at := case when v_attempts >= 5 then now() + interval '10 minutes' else null end;
    update public.pc_device_credentials
      set failed_code_attempts = v_attempts, code_locked_until = v_retry_at
      where id = p_device_credential_id;
    return jsonb_build_object('ok', false,
      'error', case when v_attempts >= 5 then 'DEVICE_TEMPORARILY_LOCKED' else 'INVALID_OR_EXPIRED_CODE' end,
      'attempts_remaining', greatest(5 - v_attempts, 0), 'retry_at', v_retry_at);
  end if;

  select c.id, c.aluno_id into v_codigo_id, v_aluno_id
  from public.codigos_temporarios c
  where c.codigo_hash = p_codigo_hash
    and c.computador_id = p_computador_id
    and c.used_at is null
    and c.revoked_at is null
    and c.expires_at > now();

  if not found then
    v_attempts := least(coalesce(v_device.failed_code_attempts, 0) + 1, 5);
    v_retry_at := case when v_attempts >= 5 then now() + interval '10 minutes' else null end;
    update public.pc_device_credentials
      set failed_code_attempts = v_attempts, code_locked_until = v_retry_at
      where id = p_device_credential_id;
    return jsonb_build_object('ok', false,
      'error', case when v_attempts >= 5 then 'DEVICE_TEMPORARILY_LOCKED' else 'INVALID_OR_EXPIRED_CODE' end,
      'attempts_remaining', greatest(5 - v_attempts, 0), 'retry_at', v_retry_at);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_aluno_id::text, 0));

  select c.* into v_codigo
  from public.codigos_temporarios c
  where c.id = v_codigo_id
    and c.codigo_hash = p_codigo_hash
    and c.computador_id = p_computador_id
    and c.used_at is null
    and c.revoked_at is null
    and c.expires_at > now()
  for update;

  if not found then
    v_attempts := least(coalesce(v_device.failed_code_attempts, 0) + 1, 5);
    v_retry_at := case when v_attempts >= 5 then now() + interval '10 minutes' else null end;
    update public.pc_device_credentials
      set failed_code_attempts = v_attempts, code_locked_until = v_retry_at
      where id = p_device_credential_id;
    return jsonb_build_object('ok', false,
      'error', case when v_attempts >= 5 then 'DEVICE_TEMPORARILY_LOCKED' else 'INVALID_OR_EXPIRED_CODE' end,
      'attempts_remaining', greatest(5 - v_attempts, 0), 'retry_at', v_retry_at);
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
    where s.user_id = v_codigo.aluno_id and s.ended_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'STUDENT_HAS_ACTIVE_SESSION');
  end if;

  if exists (
    select 1 from public.sessoes_computador s
    where s.computador_id = p_computador_id and s.ended_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'COMPUTER_IN_USE');
  end if;

  insert into public.sessoes_computador (computador_id, aluno_id, user_id, codigo_id)
    values (p_computador_id, v_codigo.aluno_id, v_codigo.aluno_id, v_codigo.id)
    returning id into v_session_id;

  update public.codigos_temporarios set used_at = now() where id = v_codigo.id;
  update public.pc_device_credentials
    set last_seen_at = now(), failed_code_attempts = 0, code_locked_until = null
    where id = p_device_credential_id;

  select u.name into v_aluno_nome
  from public.users u where u.id = v_codigo.aluno_id;

  return jsonb_build_object('ok', true, 'session_id', v_session_id,
    'aluno_id', v_codigo.aluno_id, 'aluno_nome', coalesce(v_aluno_nome, 'Aluno'),
    'computador_id', v_computador.id, 'computador_nome', v_computador.nome,
    'started_at', now());
end;
$function$;

revoke all on function public.start_pc_session_guarded(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.start_pc_session_guarded(uuid, text, uuid)
  to service_role;
