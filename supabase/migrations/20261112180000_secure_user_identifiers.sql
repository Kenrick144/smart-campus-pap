-- Geração atómica de identificadores para perfis Smart Campus.
-- Aplicada após user_forms_profile_fields.
create sequence if not exists public.administrator_number_seq;
create sequence if not exists public.professional_number_seq;
create sequence if not exists public.employee_number_seq;

-- Retomar as sequências após os números existentes.
-- Retomar também a sequência administrativa após os identificadores existentes.
select setval(
  'public.administrator_number_seq',
  greatest(coalesce((select max(nullif(regexp_replace(administrator_number, '[^0-9]', '', 'g'), '')::bigint) from public.users), 0), 1),
  coalesce((select max(nullif(regexp_replace(administrator_number, '[^0-9]', '', 'g'), '')::bigint) from public.users), 0) > 0
);

select setval(
  'public.professional_number_seq',
  greatest(coalesce((select max(nullif(regexp_replace(professional_number, '[^0-9]', '', 'g'), '')::bigint) from public.professores), 0), 1),
  coalesce((select max(nullif(regexp_replace(professional_number, '[^0-9]', '', 'g'), '')::bigint) from public.professores), 0) > 0
);
select setval(
  'public.employee_number_seq',
  greatest(coalesce((select max(nullif(regexp_replace(employee_number, '[^0-9]', '', 'g'), '')::bigint) from public.funcionarios), 0), 1),
  coalesce((select max(nullif(regexp_replace(employee_number, '[^0-9]', '', 'g'), '')::bigint) from public.funcionarios), 0) > 0
);

create unique index if not exists users_administrator_number_key
  on public.users (administrator_number)
  where administrator_number is not null;

create or replace function public.generate_user_identifier(p_role text)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_number bigint;
  v_prefix text;
begin
  if p_role in ('Administrador', 'Administrador Adjunto') then
    v_prefix := case when p_role = 'Administrador' then 'ADM-' else 'ADJ-' end;
    v_number := pg_catalog.nextval('public.administrator_number_seq');
  elsif p_role = 'Professor' then
    v_prefix := 'PROF-';
    v_number := pg_catalog.nextval('public.professional_number_seq');
  elsif p_role = 'Funcionário' then
    v_prefix := 'FUNC-';
    v_number := pg_catalog.nextval('public.employee_number_seq');
  else
    raise exception 'Perfil sem identificador automático: %', p_role using errcode = '22023';
  end if;
  return v_prefix || pg_catalog.lpad(v_number::text, 5, '0');
end;
$$;

revoke all on function public.generate_user_identifier(text) from public, anon, authenticated;
grant execute on function public.generate_user_identifier(text) to service_role;
grant usage, select, update on sequence public.administrator_number_seq to service_role;
grant usage, select, update on sequence public.professional_number_seq to service_role;
grant usage, select, update on sequence public.employee_number_seq to service_role;
