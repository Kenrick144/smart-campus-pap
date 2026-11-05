-- Smart Campus PC Agent: additive migration against the audited live schema.
-- Apply only after backup and review. This file is committed to the feature branch;
-- it has NOT been applied to the live Supabase project.

begin;

-- Permanent, non-secret QR identifier for each computer.
alter table public.computadores
  add column if not exists qr_public_id uuid not null default gen_random_uuid();

create unique index if not exists computadores_qr_public_id_uidx
  on public.computadores (qr_public_id);

-- Extend existing code/session records to all eligible Smart Campus users.
alter table public.codigos_temporarios
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists computador_id uuid references public.computadores(id) on delete cascade;

update public.codigos_temporarios c
set user_id = a.id
from public.alunos a
where c.user_id is null and c.aluno_id = a.id;

alter table public.codigos_temporarios
  alter column aluno_id drop not null,
  alter column user_id set not null;

alter table public.sessoes_computador
  add column if not exists user_id uuid references public.users(id) on delete cascade;

update public.sessoes_computador s
set user_id = a.id
from public.alunos a
where s.user_id is null and s.aluno_id = a.id;

alter table public.sessoes_computador
  alter column aluno_id drop not null,
  alter column user_id set not null;

create index if not exists codigos_temporarios_user_created_idx
  on public.codigos_temporarios (user_id, created_at desc);

create index if not exists codigos_temporarios_computer_active_idx
  on public.codigos_temporarios (computador_id, expires_at)
  where used_at is null and revoked_at is null;

create index if not exists sessoes_computador_user_active_idx
  on public.sessoes_computador (user_id, started_at desc)
  where ended_at is null;

-- A code is generated for one computer only. Rate limiting, revocation and
-- insertion happen under a per-user transaction lock.
create or replace function public.issue_pc_temporary_code(
  p_user_id uuid,
  p_computador_id uuid,
  p_codigo_hash text,
  p_expires_at timestamptz
)
returns table(id uuid, expires_at timestamptz)
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
  v_expires_at timestamptz;
  v_role text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if p_codigo_hash is null or p_codigo_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= now()
     or p_expires_at > now() + interval '10 minutes 30 seconds' then
    raise exception 'INVALID_CODE_REQUEST' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.computadores c
    where c.id = p_computador_id and c.estado = 'Operacional'
  ) then
    raise exception 'COMPUTER_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  update public.sessoes_computador
    set ended_at = now(), ended_reason = 'timeout'
    where computador_id = p_computador_id and ended_at is null
      and heartbeat_at < now() - interval '2 minutes';

  if exists (
    select 1 from public.sessoes_computador s
    where s.computador_id = p_computador_id and s.ended_at is null
  ) then
    raise exception 'COMPUTER_IN_USE' using errcode = 'P0001';
  end if;

  select u.role into v_role
  from public.users u
  where u.id = p_user_id and u.status = 'Ativo';

  if v_role is null or v_role not in ('Aluno', 'Professor', 'Funcionário') then
    raise exception 'USER_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if v_role = 'Aluno' and (
    not exists (select 1 from public.alunos a where a.id = p_user_id)
    or not exists (
      select 1 from public.alunos_turmas at
      where at.aluno_id = p_user_id and at.data_fim is null
    )
  ) then
    raise exception 'STUDENT_NOT_ENROLLED' using errcode = 'P0001';
  elsif v_role = 'Professor' and not exists (
    select 1 from public.professores p
    where p.id = p_user_id and p.professional_status = 'Ativo'
  ) then
    raise exception 'TEACHER_NOT_ACTIVE' using errcode = 'P0001';
  elsif v_role = 'Funcionário' and not exists (
    select 1 from public.funcionarios f
    where f.id = p_user_id and f.professional_status = 'Ativo'
  ) then
    raise exception 'STAFF_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  update public.sessoes_computador
    set ended_at = now(), ended_reason = 'timeout'
    where user_id = p_user_id and ended_at is null
      and heartbeat_at < now() - interval '2 minutes';

  if exists (
    select 1 from public.sessoes_computador s
    where s.user_id = p_user_id and s.ended_at is null
  ) then
    raise exception 'USER_HAS_ACTIVE_SESSION' using errcode = 'P0001';
  end if;

  if (
    select count(*) from public.codigos_temporarios c
    where c.user_id = p_user_id and c.created_at > now() - interval '15 minutes'
  ) >= 5 then
    raise exception 'CODE_RATE_LIMITED' using errcode = 'P0001';
  end if;

  update public.codigos_temporarios
    set revoked_at = now()
    where user_id = p_user_id and used_at is null and revoked_at is null;

  insert into public.codigos_temporarios
    (aluno_id, user_id, computador_id, codigo_hash, expires_at)
  values
    (case when v_role = 'Aluno' then p_user_id else null end,
     p_user_id, p_computador_id, p_codigo_hash, p_expires_at)
  returning codigos_temporarios.id, codigos_temporarios.expires_at
    into v_id, v_expires_at;

  return query select v_id, v_expires_at;
end;
$function$;

-- Validate the per-device secret and consume a code for this exact computer
-- in one transaction. The device secret itself is never stored in the DB.
create or replace function public.pc_agent_start_session(
  p_computador_id uuid,
  p_code_hash text,
  p_agent_key_hash text
)
returns table(
  session_id uuid,
  user_id uuid,
  user_name text,
  user_role text,
  computador_id uuid,
  computador_nome text,
  started_at timestamptz
)
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_computador public.computadores%rowtype;
  v_codigo public.codigos_temporarios%rowtype;
  v_credential public.pc_device_credentials%rowtype;
  v_user public.users%rowtype;
  v_session_id uuid;
begin
  select * into v_computador
  from public.computadores
  where id = p_computador_id
  for update;

  if not found or v_computador.estado <> 'Operacional' then
    raise exception 'COMPUTER_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select * into v_credential
  from public.pc_device_credentials d
  where d.computador_id = p_computador_id
    and d.token_hash = p_agent_key_hash
    and d.revoked_at is null
  for update;

  if not found then
    raise exception 'INVALID_DEVICE_CREDENTIAL' using errcode = 'P0001';
  end if;

  select * into v_codigo
  from public.codigos_temporarios c
  where c.codigo_hash = p_code_hash
    and c.computador_id = p_computador_id
    and c.used_at is null and c.revoked_at is null
    and c.expires_at > now();

  if not found then
    raise exception 'INVALID_OR_EXPIRED_CODE_FOR_COMPUTER' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_codigo.user_id::text, 0));

  select * into v_codigo
  from public.codigos_temporarios c
  where c.id = v_codigo.id
    and c.codigo_hash = p_code_hash
    and c.computador_id = p_computador_id
    and c.used_at is null and c.revoked_at is null
    and c.expires_at > now()
  for update;

  if not found then
    raise exception 'INVALID_OR_EXPIRED_CODE_FOR_COMPUTER' using errcode = 'P0001';
  end if;

  select * into v_user
  from public.users u
  where u.id = v_codigo.user_id and u.status = 'Ativo'
    and u.role in ('Aluno', 'Professor', 'Funcionário');

  if not found then
    raise exception 'USER_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if v_user.role = 'Aluno' and (
    not exists (select 1 from public.alunos a where a.id = v_user.id)
    or not exists (
      select 1 from public.alunos_turmas at
      where at.aluno_id = v_user.id and at.data_fim is null
    )
  ) then
    raise exception 'STUDENT_NOT_ENROLLED' using errcode = 'P0001';
  elsif v_user.role = 'Professor' and not exists (
    select 1 from public.professores p
    where p.id = v_user.id and p.professional_status = 'Ativo'
  ) then
    raise exception 'TEACHER_NOT_ACTIVE' using errcode = 'P0001';
  elsif v_user.role = 'Funcionário' and not exists (
    select 1 from public.funcionarios f
    where f.id = v_user.id and f.professional_status = 'Ativo'
  ) then
    raise exception 'STAFF_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  update public.sessoes_computador
    set ended_at = now(), ended_reason = 'timeout'
    where ended_at is null and heartbeat_at < now() - interval '2 minutes';

  if exists (
    select 1 from public.sessoes_computador s
    where s.user_id = v_user.id and s.ended_at is null
  ) then
    raise exception 'USER_HAS_ACTIVE_SESSION' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.sessoes_computador s
    where s.computador_id = p_computador_id and s.ended_at is null
  ) then
    raise exception 'COMPUTER_IN_USE' using errcode = 'P0001';
  end if;

  insert into public.sessoes_computador
    (computador_id, aluno_id, user_id, codigo_id)
  values
    (p_computador_id,
     case when v_user.role = 'Aluno' then v_user.id else null end,
     v_user.id, v_codigo.id)
  returning sessoes_computador.id into v_session_id;

  update public.codigos_temporarios set used_at = now() where id = v_codigo.id;
  update public.pc_device_credentials
    set last_seen_at = now()
    where id = v_credential.id;

  return query
    select v_session_id, v_user.id, v_user.name, v_user.role,
           v_computador.id, v_computador.nome, now();
end;
$function$;

create or replace function public.pc_agent_end_session(
  p_computador_id uuid,
  p_session_id uuid,
  p_agent_key_hash text,
  p_end_reason text default 'desligado'
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_credential_id uuid;
  v_updated integer;
begin
  if p_end_reason not in ('aluno', 'administrador', 'timeout', 'desligado', 'erro') then
    raise exception 'INVALID_END_REASON' using errcode = 'P0001';
  end if;

  select d.id into v_credential_id
  from public.pc_device_credentials d
  where d.computador_id = p_computador_id
    and d.token_hash = p_agent_key_hash
    and d.revoked_at is null
  for update;

  if not found then
    raise exception 'INVALID_DEVICE_CREDENTIAL' using errcode = 'P0001';
  end if;

  update public.sessoes_computador
  set ended_at = now(), ended_reason = p_end_reason
  where id = p_session_id
    and computador_id = p_computador_id
    and ended_at is null;

  get diagnostics v_updated = row_count;

  update public.pc_device_credentials
    set last_seen_at = now()
    where id = v_credential_id;

  return v_updated = 1;
end;
$function$;

-- These RPCs are only invoked by trusted server routes using service_role.
revoke all on function public.issue_pc_temporary_code(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.pc_agent_start_session(uuid, text, text) from public, anon, authenticated;
revoke all on function public.pc_agent_end_session(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.issue_pc_temporary_code(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.pc_agent_start_session(uuid, text, text) to service_role;
grant execute on function public.pc_agent_end_session(uuid, uuid, text, text) to service_role;

commit;
