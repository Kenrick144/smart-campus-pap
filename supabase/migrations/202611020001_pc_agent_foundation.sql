-- Smart Campus PC Agent foundation
-- Adds device identity and server-managed, single-use access codes.

alter table public.computers
  add column if not exists agent_secret_hash text,
  add column if not exists agent_version text,
  add column if not exists os_version text,
  add column if not exists last_seen_at timestamptz;

create table if not exists public.pc_access_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists pc_access_codes_user_created_idx
  on public.pc_access_codes (user_id, created_at desc);
create index if not exists pc_access_codes_expiry_idx
  on public.pc_access_codes (expires_at)
  where used_at is null and revoked_at is null;

create table if not exists public.pc_sessions (
  id uuid primary key default gen_random_uuid(),
  computer_id uuid not null references public.computers(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text
);

create unique index if not exists pc_sessions_one_active_per_computer
  on public.pc_sessions (computer_id)
  where ended_at is null;
create index if not exists pc_sessions_user_started_idx
  on public.pc_sessions (user_id, started_at desc);

alter table public.pc_access_codes enable row level security;
alter table public.pc_sessions enable row level security;

drop policy if exists "Users can read own PC access codes" on public.pc_access_codes;
create policy "Users can read own PC access codes"
  on public.pc_access_codes for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can read own PC sessions" on public.pc_sessions;
create policy "Users can read own PC sessions"
  on public.pc_sessions for select
  to authenticated using (auth.uid() = user_id);

revoke all on public.pc_access_codes from anon, authenticated;
grant select on public.pc_access_codes to authenticated;
revoke all on public.pc_sessions from anon, authenticated;
grant select on public.pc_sessions to authenticated;
grant all on public.pc_access_codes to service_role;
grant all on public.pc_sessions to service_role;

create or replace function public.pc_agent_start_session(
  p_computer_id uuid,
  p_code_hash text,
  p_agent_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_computer public.computers%rowtype;
  v_code public.pc_access_codes%rowtype;
  v_session public.pc_sessions%rowtype;
begin
  select * into v_computer
  from public.computers
  where id = p_computer_id
  for update;

  if not found or v_computer.agent_secret_hash is null
     or v_computer.agent_secret_hash <> p_agent_key_hash then
    raise exception 'Dispositivo não autorizado.';
  end if;

  if v_computer.estado = 'Manutenção' then
    raise exception 'Este computador está em manutenção.';
  end if;

  if exists (
    select 1 from public.pc_sessions
    where computer_id = p_computer_id and ended_at is null
  ) then
    raise exception 'Este computador já tem uma sessão ativa.';
  end if;

  select * into v_code
  from public.pc_access_codes
  where code_hash = p_code_hash
    and used_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Código inválido, expirado ou já utilizado.';
  end if;

  update public.pc_access_codes set used_at = now() where id = v_code.id;

  insert into public.pc_sessions (computer_id, user_id)
  values (p_computer_id, v_code.user_id)
  returning * into v_session;

  update public.computers
  set estado = 'Ocupado',
      utilizador = v_code.user_id::text,
      utilizacao = to_char(now(), 'HH24:MI'),
      last_seen_at = now()
  where id = p_computer_id;

  return jsonb_build_object(
    'session_id', v_session.id,
    'computer_id', p_computer_id,
    'user_id', v_code.user_id,
    'started_at', v_session.started_at
  );
end;
$$;

create or replace function public.pc_agent_end_session(
  p_session_id uuid,
  p_computer_id uuid,
  p_agent_key_hash text,
  p_end_reason text default 'ended'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_computer public.computers%rowtype;
begin
  select * into v_computer
  from public.computers
  where id = p_computer_id
  for update;

  if not found or v_computer.agent_secret_hash is null
     or v_computer.agent_secret_hash <> p_agent_key_hash then
    raise exception 'Dispositivo não autorizado.';
  end if;

  update public.pc_sessions
  set ended_at = now(), end_reason = left(coalesce(p_end_reason, 'ended'), 80)
  where id = p_session_id
    and computer_id = p_computer_id
    and ended_at is null;

  if not found then
    raise exception 'Sessão ativa não encontrada.';
  end if;

  update public.computers
  set estado = 'Livre', utilizador = '—', utilizacao = '—', last_seen_at = now()
  where id = p_computer_id;

  return true;
end;
$$;

revoke all on function public.pc_agent_start_session(uuid, text, text) from public, anon, authenticated;
revoke all on function public.pc_agent_end_session(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.pc_agent_start_session(uuid, text, text) to service_role;
grant execute on function public.pc_agent_end_session(uuid, uuid, text, text) to service_role;
