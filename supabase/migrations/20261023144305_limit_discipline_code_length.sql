alter table public.disciplinas
  add constraint disciplinas_codigo_tamanho_check
  check (codigo is null or char_length(codigo) <= 40);
