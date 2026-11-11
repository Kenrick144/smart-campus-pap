-- Keep course records valid and aligned with the form's input limits.
alter table public.cursos
  add constraint cursos_nome_tamanho_check
  check (char_length(nome) <= 120);

alter table public.cursos
  add constraint cursos_descricao_tamanho_check
  check (descricao is null or char_length(descricao) <= 2000);
