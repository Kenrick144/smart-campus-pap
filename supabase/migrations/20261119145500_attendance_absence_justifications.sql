-- Smart Campus: justificações de faltas e histórico de decisões.
-- Esta migração preserva os registos existentes em public.presencas.

create table if not exists public.justificacoes_faltas (
  id uuid primary key default gen_random_uuid(),
  presenca_id uuid not null unique references public.presencas(id) on delete restrict,
  aluno_id uuid not null references public.alunos(id) on delete restrict,
  motivo text not null check (char_length(btrim(motivo)) between 10 and 3000),
  anexo_path text,
  estado text not null default 'Pendente'
    check (estado in ('Pendente','Aceite','Rejeitada')),
  decisao_motivo text,
  decidido_por uuid references public.users(id) on delete set null,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint justificacoes_faltas_decisao_consistente check (
    (estado = 'Pendente' and decidido_por is null and decidido_em is null)
    or
    (estado in ('Aceite','Rejeitada') and decidido_por is not null and decidido_em is not null)
  )
);

create table if not exists public.justificacoes_faltas_historico (
  id uuid primary key default gen_random_uuid(),
  justificacao_id uuid not null references public.justificacoes_faltas(id) on delete restrict,
  estado_anterior text,
  estado_novo text not null check (estado_novo in ('Pendente','Aceite','Rejeitada')),
  motivo_decisao text,
  alterado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists justificacoes_faltas_aluno_idx
  on public.justificacoes_faltas (aluno_id, created_at desc);
create index if not exists justificacoes_faltas_estado_idx
  on public.justificacoes_faltas (estado, created_at desc);
create index if not exists justificacoes_faltas_historico_parent_idx
  on public.justificacoes_faltas_historico (justificacao_id, created_at desc);

alter table public.justificacoes_faltas enable row level security;
alter table public.justificacoes_faltas_historico enable row level security;

grant select, insert on public.justificacoes_faltas to authenticated;
grant select on public.justificacoes_faltas_historico to authenticated;
revoke update on public.justificacoes_faltas from authenticated;
grant update (estado, decisao_motivo, decidido_por, decidido_em, updated_at)
  on public.justificacoes_faltas to authenticated;

drop policy if exists justificacoes_aluno_select_own on public.justificacoes_faltas;
create policy justificacoes_aluno_select_own
on public.justificacoes_faltas for select to authenticated
using (aluno_id = (select auth.uid()));

drop policy if exists justificacoes_aluno_insert_own on public.justificacoes_faltas;
create policy justificacoes_aluno_insert_own
on public.justificacoes_faltas for insert to authenticated
with check (
  aluno_id = (select auth.uid())
  and estado = 'Pendente'
  and decidido_por is null
  and decidido_em is null
  and exists (
    select 1 from public.presencas p
    where p.id = presenca_id
      and p.aluno_id = (select auth.uid())
      and p.estado = 'Falta'
  )
);

drop policy if exists justificacoes_staff_select on public.justificacoes_faltas;
create policy justificacoes_staff_select
on public.justificacoes_faltas for select to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role in ('Administrador','Administrador Adjunto','Funcionário')
  )
);

drop policy if exists justificacoes_coordenador_select on public.justificacoes_faltas;
create policy justificacoes_coordenador_select
on public.justificacoes_faltas for select to authenticated
using (
  exists (
    select 1
    from public.presencas p
    join public.horarios h on h.id = p.horario_id
    join public.turmas t on t.id = h.turma_id
    where p.id = presenca_id
      and t.professor_coordenador_id = (select auth.uid())
  )
);

drop policy if exists justificacoes_staff_decide on public.justificacoes_faltas;
create policy justificacoes_staff_decide
on public.justificacoes_faltas for update to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role in ('Administrador','Administrador Adjunto')
  )
  or exists (
    select 1
    from public.presencas p
    join public.horarios h on h.id = p.horario_id
    join public.turmas t on t.id = h.turma_id
    where p.id = presenca_id
      and t.professor_coordenador_id = (select auth.uid())
  )
)
with check (
  estado in ('Aceite','Rejeitada')
  and decidido_por = (select auth.uid())
  and decidido_em is not null
  and exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role in ('Administrador','Administrador Adjunto','Professor')
  )
);

drop policy if exists justificacoes_historico_select_own on public.justificacoes_faltas_historico;
create policy justificacoes_historico_select_own
on public.justificacoes_faltas_historico for select to authenticated
using (
  exists (
    select 1 from public.justificacoes_faltas j
    where j.id = justificacao_id and j.aluno_id = (select auth.uid())
  )
);

drop policy if exists justificacoes_historico_select_staff on public.justificacoes_faltas_historico;
create policy justificacoes_historico_select_staff
on public.justificacoes_faltas_historico for select to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role in ('Administrador','Administrador Adjunto','Funcionário')
  )
);

drop policy if exists justificacoes_historico_select_coordenador on public.justificacoes_faltas_historico;
create policy justificacoes_historico_select_coordenador
on public.justificacoes_faltas_historico for select to authenticated
using (
  exists (
    select 1
    from public.justificacoes_faltas j
    join public.presencas p on p.id = j.presenca_id
    join public.horarios h on h.id = p.horario_id
    join public.turmas t on t.id = h.turma_id
    where j.id = justificacao_id
      and t.professor_coordenador_id = (select auth.uid())
  )
);

drop policy if exists justificacoes_historico_select_teacher on public.justificacoes_faltas_historico;
create policy justificacoes_historico_select_teacher
on public.justificacoes_faltas_historico for select to authenticated
using (
  exists (
    select 1
    from public.justificacoes_faltas j
    join public.presencas p on p.id = j.presenca_id
    join public.horarios h on h.id = p.horario_id
    where j.id = justificacao_id
      and h.professor_id = (select auth.uid())
  )
);

drop policy if exists presencas_select_admin on public.presencas;
create policy presencas_select_admin
on public.presencas for select to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role in ('Administrador','Administrador Adjunto')
  )
);

drop policy if exists presencas_select_funcionario on public.presencas;
create policy presencas_select_funcionario
on public.presencas for select to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.status = 'Ativo'
      and u.role = 'Funcionário'
  )
);

drop policy if exists presencas_select_coordenador on public.presencas;
create policy presencas_select_coordenador
on public.presencas for select to authenticated
using (
  exists (
    select 1
    from public.horarios h
    join public.turmas t on t.id = h.turma_id
    where h.id = horario_id
      and t.professor_coordenador_id = (select auth.uid())
  )
);

create or replace function private.registar_historico_justificacao()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.justificacoes_faltas_historico
      (justificacao_id, estado_anterior, estado_novo, motivo_decisao, alterado_por)
    values (new.id, null, new.estado, null, new.aluno_id);
    return new;
  end if;

  if old.estado <> 'Pendente' then
    raise exception 'Uma justificação decidida não pode ser alterada.';
  end if;

  new.updated_at := now();

  if new.estado in ('Aceite','Rejeitada') then
    insert into public.justificacoes_faltas_historico
      (justificacao_id, estado_anterior, estado_novo, motivo_decisao, alterado_por)
    values (new.id, old.estado, new.estado, new.decisao_motivo, new.decidido_por);

    if new.estado = 'Aceite' then
      update public.presencas
      set estado = 'Falta justificada', updated_at = now()
      where id = new.presenca_id and aluno_id = new.aluno_id and estado = 'Falta';
      if not found then
        raise exception 'A falta original já não está pendente de justificação.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.registar_historico_justificacao() from public, anon, authenticated;

drop trigger if exists justificacoes_faltas_historico_trigger on public.justificacoes_faltas;
create trigger justificacoes_faltas_historico_trigger
before insert or update on public.justificacoes_faltas
for each row execute function private.registar_historico_justificacao();
