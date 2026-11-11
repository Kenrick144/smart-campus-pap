-- Prevent empty discipline names/codes and case/whitespace-only duplicates.
-- Codes are optional, but when provided they must not be blank.

alter table public.disciplinas
  add constraint disciplinas_nome_nao_vazio_check
  check (length(btrim(nome)) > 0);

alter table public.disciplinas
  add constraint disciplinas_codigo_nao_vazio_check
  check (codigo is null or length(btrim(codigo)) > 0);

create unique index if not exists disciplinas_nome_normalizado_uidx
  on public.disciplinas (lower(btrim(nome)));

create unique index if not exists disciplinas_codigo_normalizado_uidx
  on public.disciplinas (lower(btrim(codigo)))
  where codigo is not null;
