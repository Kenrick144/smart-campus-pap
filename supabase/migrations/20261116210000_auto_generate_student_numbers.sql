-- Numeração automática de alunos (001, 002, 003...), gerada no servidor.
create sequence if not exists public.student_number_seq;

-- A sequência começa no número seguinte ao maior identificador já existente.
-- O registo legado "1" é preservado sem alterações; o próximo será "002".
select setval(
  'public.student_number_seq',
  greatest(
    coalesce((
      select max(nullif(regexp_replace(student_number, '[^0-9]', '', 'g'), '')::bigint)
      from public.alunos
    ), 0) + 1,
    1
  ),
  false
);

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
  elsif p_role = 'Aluno' then
    v_number := pg_catalog.nextval('public.student_number_seq');
    return pg_catalog.lpad(v_number::text, 3, '0');
  else
    raise exception 'Perfil sem identificador automático: %', p_role using errcode = '22023';
  end if;

  return v_prefix || pg_catalog.lpad(v_number::text, 5, '0');
end;
$$;

revoke all on function public.generate_user_identifier(text) from public, anon, authenticated;
grant execute on function public.generate_user_identifier(text) to service_role;

revoke all on sequence public.student_number_seq from public, anon, authenticated;
grant usage, select, update on sequence public.student_number_seq to service_role;
