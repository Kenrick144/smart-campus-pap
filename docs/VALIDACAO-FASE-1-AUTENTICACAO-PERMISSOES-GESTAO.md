# Smart Campus — Validação Fase 1

Data: 11-11-2026

Âmbito solicitado:
1. Autenticação dos cinco perfis.
2. Permissões do Administrador e Administrador Adjunto.
3. Gestão de alunos, professores, turmas e disciplinas.
4. Anos letivos.

## Resultado executivo

- **21 verificações estáticas do código: PASS.**
- **Base Supabase de produção consultada apenas em leitura.**
- Existem 5 utilizadores em `auth.users` e 5 perfis em `public.users`.
- A distribuição de perfis é exatamente 1 Aluno, 1 Professor, 1 Funcionário, 1 Administrador Adjunto e 1 Administrador.
- Estado atual dos dados: 1 ano letivo ativo, 1 turma, 5 disciplinas, 1 curso, 1 associação aluno-turma e 5 associações turma-disciplina.
- As migrações de anos letivos, disciplinas, cursos, turmas e permissões relevantes estão presentes no histórico de migrações ativo.
- **Não foram criados, editados ou eliminados utilizadores, registos ou migrações.**

## 1. Autenticação dos cinco perfis

| Verificação | Resultado |
|---|---|
| Login valida os cinco nomes de perfil | PASS |
| Login exige conta com estado `Ativo` | PASS |
| Login termina a sessão de conta inativa/perfil inválido | PASS |
| Redirecionamento de Aluno para `/aluno` | PASS |
| Redirecionamento de Funcionário para `/funcionario` | PASS |
| Redirecionamento dos restantes perfis para `/dashboard` | PASS |
| Os cinco perfis existem na base de dados | PASS |
| Cada perfil tem exatamente uma conta | PASS |

**Limitação:** não foram efetuados logins reais com palavras-passe. Não foram disponibilizadas credenciais de teste e não foram alteradas palavras-passe. A validação real do formulário de login, cookies e sessão ainda precisa de ser executada no ambiente da aplicação.

## 2. Administrador e Administrador Adjunto

| Verificação | Resultado |
|---|---|
| Ambos podem aceder às áreas administrativas permitidas no workspace | PASS |
| Administrador Adjunto não acede a Configurações | PASS |
| Adjunto não pode criar contas Administrador/Administrador Adjunto | PASS |
| Adjunto não pode editar contas administrativas | PASS |
| Adjunto não pode redefinir palavra-passe através da rota de gestão de utilizadores | PASS |
| Adjunto não recebe NIF, número de documento, NISS, número de saúde ou morada completa | PASS |
| Último Administrador ativo não pode ser desativado/rebaixado | PASS |
| APIs de escrita verificam sessão, perfil e estado ativo | PASS |

A API `campus-data` autoriza operações de gestão escolar apenas para os perfis administrativos. O código de gestão de utilizadores aplica regras adicionais ao Administrador Adjunto.

**Limitação:** os testes HTTP com tokens reais de cada perfil não foram executados nesta fase.

## 3. Gestão de alunos, professores, turmas e disciplinas

| Verificação | Resultado |
|---|---|
| Aluno só consulta a própria ficha na API de campus | PASS |
| Professor consulta alunos das turmas que lhe estão atribuídas | PASS |
| Professor consulta a própria ficha de professor | PASS |
| Aluno e Professor só recebem turmas associadas | PASS |
| Aluno e Professor têm disciplinas filtradas pelas associações | PASS |
| Criação/edição de turma exige ano, curso, capacidade e disciplina | PASS |
| Capacidade de turma validada entre 1 e 500 | PASS |
| Disciplinas selecionadas têm de estar ativas | PASS |
| Remoção de disciplina de turma preserva o histórico | PASS |
| Eliminação de turma com histórico é bloqueada | PASS |

## 4. Anos letivos

| Verificação | Resultado |
|---|---|
| Nome obrigatório | PASS |
| Datas ISO válidas | PASS |
| Data final posterior à inicial | PASS |
| Índice único impede nomes duplicados normalizados | PASS |
| Índice parcial impede mais de um ano ativo | PASS |
| Trigger desativa o ano ativo anterior ao ativar outro | PASS |
| Turmas só podem ser criadas em ano ativo, salvo reutilização controlada | PASS |

## Base de dados e RLS

- As tabelas relevantes consultadas têm RLS ativado.
- O histórico ativo contém as migrações de segurança do perfil, regras do ano letivo, regras de disciplinas, gestão de turmas, cursos, histórico das disciplinas e reutilização de turmas.
- As políticas RLS existentes para `users`, `alunos`, `professores`, `funcionarios`, `turmas`, `alunos_turmas` e `disciplinas_turmas` foram inspecionadas.
- As políticas de `users` permitem ao utilizador consultar a própria linha e ao Administrador consultar todas as linhas. O Administrador Adjunto utiliza endpoints de servidor que verificam explicitamente o seu perfil e limitam os campos devolvidos.

## Observações de segurança a acompanhar

O Supabase Security Advisor reporta:
1. Proteção contra palavras-passe comprometidas desativada no Auth.
2. Quatro tabelas com RLS ativo e sem políticas (`codigos_temporarios`, `cursos`, `pc_device_credentials`, `sessoes_computador`). Sem políticas, o RLS bloqueia o acesso direto; deve manter-se a revisão dos privilégios e dos endpoints que usam service role.

Estas observações não foram alteradas porque esta fase é de testes e não foi autorizada qualquer alteração à base de dados.

## Testes ainda pendentes para declarar a fase concluída

1. Executar o projeto com configuração local válida e dependências instaladas em Node.js 24.
2. Fazer login real com cada uma das cinco contas e confirmar o redirecionamento.
3. Testar pedidos HTTP autenticados para cada perfil, incluindo tentativas proibidas (esperado: 401/403).
4. Criar, editar, associar e desativar registos de teste em ambiente de desenvolvimento, nunca em produção sem autorização.
5. Executar `npm run lint`, `npm run typecheck` e `npm run build`.

## Limitações do ambiente desta execução

- O ambiente de trabalho não tem `.env.local` nem variáveis Supabase da aplicação.
- O ambiente de Node disponível é 22.16.0; o projeto/dependências requerem Node.js 24.
- A instalação das dependências não terminou, por isso lint, TypeScript e build não foram validados.
- A base Supabase foi consultada por operações SQL de leitura; não foram aplicadas migrações nem feitas alterações de dados.
