create extension if not exists "pgcrypto";

create type public.user_role as enum ('Administrador', 'Professor', 'Aluno', 'Funcionário');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.user_role not null default 'Aluno',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_unique on public.profiles (lower(email));
create unique index if not exists profiles_single_admin on public.profiles (role) where role = 'Administrador';
create unique index if not exists students_email_unique on public.students (lower(email)) where email is not null;
create unique index if not exists students_numero_unique on public.students (numero) where numero is not null;
create unique index if not exists teachers_email_unique on public.teachers (lower(email)) where email is not null;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  numero text,
  turma text,
  email text,
  estado text not null default 'Ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  disciplina text,
  turmas text,
  email text,
  estado text not null default 'Ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  turma text not null,
  curso text,
  diretor text,
  sala text,
  ano_letivo text,
  alunos text,
  estado text not null default 'Ativa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.disciplines (
  id uuid primary key default gen_random_uuid(),
  disciplina text not null,
  codigo text,
  professor text,
  turmas text,
  carga_horaria text,
  estado text not null default 'Ativa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  aluno text not null,
  turma text,
  disciplina text,
  sala text,
  data text,
  hora text,
  estado text not null default 'Presente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule (
  id uuid primary key default gen_random_uuid(),
  dia text,
  hora text,
  turma text,
  disciplina text,
  professor text,
  sala text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  sala text not null,
  edificio text,
  capacidade text,
  equipamentos text,
  estado text not null default 'Disponível',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.computers (
  id uuid primary key default gen_random_uuid(),
  computador text not null,
  sala text,
  utilizador text,
  utilizacao text,
  estado text not null default 'Livre',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  tipo text,
  destino text,
  criado text,
  estado text not null default 'Ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  atividade text not null,
  utilizador text,
  destino text,
  data text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.disciplines enable row level security;
alter table public.attendance enable row level security;
alter table public.schedule enable row level security;
alter table public.rooms enable row level security;
alter table public.computers enable row level security;
alter table public.qr_codes enable row level security;
alter table public.activity_logs enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.teachers to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.disciplines to authenticated;
grant select, insert, update, delete on public.attendance to authenticated;
grant select, insert, update, delete on public.schedule to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.computers to authenticated;
grant select, insert, update, delete on public.qr_codes to authenticated;
grant select, insert, update, delete on public.activity_logs to authenticated;

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can delete own profile" on public.profiles for delete using (auth.uid() = id);

create policy "Authenticated users can read students" on public.students for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage students" on public.students for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users can read students" on public.students for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage students" on public.students for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users can read teachers" on public.teachers for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage teachers" on public.teachers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users can read classes" on public.classes for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage classes" on public.classes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users can read disciplines" on public.disciplines for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage disciplines" on public.disciplines for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users can read attendance" on public.attendance for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage attendance" on public.attendance for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users can read schedule" on public.schedule for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage schedule" on public.schedule for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users can read rooms" on public.rooms for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage rooms" on public.rooms for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users can read computers" on public.computers for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage computers" on public.computers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users can read QR codes" on public.qr_codes for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage QR codes" on public.qr_codes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users can read activity logs" on public.activity_logs for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage activity logs" on public.activity_logs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_profiles_updated_at before update on public.profiles for each row execute procedure public.handle_updated_at();
create trigger set_students_updated_at before update on public.students for each row execute procedure public.handle_updated_at();
create trigger set_teachers_updated_at before update on public.teachers for each row execute procedure public.handle_updated_at();
create trigger set_classes_updated_at before update on public.classes for each row execute procedure public.handle_updated_at();
create trigger set_disciplines_updated_at before update on public.disciplines for each row execute procedure public.handle_updated_at();
create trigger set_attendance_updated_at before update on public.attendance for each row execute procedure public.handle_updated_at();
create trigger set_schedule_updated_at before update on public.schedule for each row execute procedure public.handle_updated_at();
create trigger set_rooms_updated_at before update on public.rooms for each row execute procedure public.handle_updated_at();
create trigger set_computers_updated_at before update on public.computers for each row execute procedure public.handle_updated_at();
create trigger set_qr_codes_updated_at before update on public.qr_codes for each row execute procedure public.handle_updated_at();
create trigger set_activity_logs_updated_at before update on public.activity_logs for each row execute procedure public.handle_updated_at();

create or replace function public.enforce_profile_constraints()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_admin_count integer;
begin
  if trim(coalesce(new.email, '')) = '' then
    raise exception 'O email do utilizador é obrigatório.';
  end if;

  if new.role = 'Administrador' then
    if auth.uid() is not null and auth.uid() = new.id then
      if tg_op = 'INSERT' then
        raise exception 'Não é permitido atribuir o perfil de Administrador ao próprio utilizador.';
      elsif old.role is distinct from 'Administrador' then
        raise exception 'Não é permitido atribuir o perfil de Administrador ao próprio utilizador.';
      end if;
    end if;

    if auth.uid() is not null and auth.uid() <> new.id then
      raise exception 'Não é permitido atribuir o perfil de Administrador a outra conta.';
    end if;

    select count(*) into current_admin_count
    from public.profiles
    where role = 'Administrador' and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if current_admin_count > 0 then
      raise exception 'Já existe uma conta de Administrador no sistema.';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_enforce_constraints
before insert or update on public.profiles
for each row execute procedure public.enforce_profile_constraints();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    case
      when lower(new.email) like '%admin%' then 'Administrador'::public.user_role
      when lower(new.email) like '%professor%' then 'Professor'::public.user_role
      when lower(new.email) like '%funcionario%' or lower(new.email) like '%funcionário%' then 'Funcionário'::public.user_role
      else 'Aluno'::public.user_role
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.students (nome, numero, turma, email, estado)
values
  ('João Silva', '2025001', '12.º T1', 'joao.silva@smartcampus.pt', 'Ativo'),
  ('Ana Pereira', '2025002', '12.º T1', 'ana.pereira@smartcampus.pt', 'Ativo'),
  ('Pedro Costa', '2025003', '11.º T2', 'pedro.costa@smartcampus.pt', 'Ativo')
on conflict do nothing;

insert into public.teachers (nome, disciplina, turmas, email, estado)
values
  ('Maria Santos', 'Matemática', '12.º T1, 11.º T2', 'maria.santos@smartcampus.pt', 'Ativo'),
  ('Rita Fernandes', 'Português', '12.º T1', 'rita.fernandes@smartcampus.pt', 'Ativo'),
  ('Carlos Mendes', 'Informática', '10.º T1, 11.º T2', 'carlos.mendes@smartcampus.pt', 'Ativo')
on conflict do nothing;

insert into public.classes (turma, curso, diretor, sala, ano_letivo, alunos)
values
  ('12.º T1', 'Gestão e Programação de Sistemas Informáticos', 'Maria Santos', 'Sala 101', '2026/2027', '24'),
  ('11.º T2', 'Multimédia', 'Rita Fernandes', 'Sala 202', '2026/2027', '21'),
  ('10.º T1', 'Informática', 'Carlos Mendes', 'Sala 105', '2026/2027', '23')
on conflict do nothing;

insert into public.disciplines (disciplina, codigo, professor, turmas, carga_horaria, estado)
values
  ('Matemática', 'MAT12', 'Maria Santos', '12.º T1, 11.º T2', '4h', 'Ativa'),
  ('Português', 'POR12', 'Rita Fernandes', '12.º T1', '3h', 'Ativa'),
  ('Programação', 'INF12', 'Carlos Mendes', '12.º T1', '5h', 'Ativa')
on conflict do nothing;

insert into public.rooms (sala, edificio, capacidade, equipamentos, estado)
values
  ('Sala 101', 'Bloco A', '28', '24 computadores', 'Disponível'),
  ('Sala 202', 'Bloco B', '25', 'Projetor', 'Ocupada'),
  ('Sala 105', 'Bloco A', '30', 'Quadro interativo', 'Disponível')
on conflict do nothing;

insert into public.computers (computador, sala, utilizador, utilizacao, estado)
values
  ('PC-01', 'Sala 101', '—', '—', 'Livre'),
  ('PC-02', 'Sala 101', 'João Silva', '09:15', 'Ocupado'),
  ('PC-03', 'Sala 101', '—', '—', 'Livre'),
  ('PC-04', 'Sala 202', '—', '—', 'Reservado'),
  ('PC-05', 'Sala 202', '—', '08:00', 'Manutenção')
on conflict do nothing;

insert into public.qr_codes (codigo, tipo, destino, criado, estado)
values
  ('QR-S101', 'Sala', 'Sala 101', '01/09/2026', 'Ativo'),
  ('QR-PC01', 'Computador', 'PC-01', '01/09/2026', 'Ativo'),
  ('QR-S202', 'Sala', 'Sala 202', '03/09/2026', 'Ativo')
on conflict do nothing;
