# Smart Campus — Estado da Fase 2

Data: 2026-11-16  
Branch de trabalho: `main`  
Estado deste registo: auditoria do repositório; não representa uma consulta ao Supabase em produção.

## Alterações já registadas em `main`

- `50ef5fb` — o perfil Funcionário pode consultar presenças através da API de campus, em coerência com a leitura transversal. A resposta deste perfil não inclui observações nem os identificadores internos do aluno e do horário.
- `e26adf7` — clarifica no código a validação das alterações de presenças feitas por Professor. A validação do horário do professor e da pertença do aluno à turma já é executada para operações de criação e alteração.

## Matriz de acesso observada na API

| Perfil | Leitura | Escrita |
|---|---|---|
| Administrador | Global | Gestão autorizada pela API |
| Administrador Adjunto | Global, com restrições nos dados de contas | Gestão autorizada pela API |
| Professor | Turmas, horários e presenças do seu âmbito | Presenças apenas nos seus horários e alunos dessas turmas |
| Aluno | Dados próprios e informação das suas turmas | Sem escrita nesta API |
| Funcionário | Leitura transversal, incluindo presenças, com projeção reduzida | Sem escrita nesta API |

A API valida sessão, conta ativa e perfil no servidor. As operações de escrita usam uma lista explícita de recursos e verificações de autorização. O cliente não deve ser tratado como fronteira de segurança.

## Migrações Supabase — decisão de segurança

- Nenhuma migração foi aplicada durante esta revisão.
- `202611020001_pc_agent_foundation.sql` está marcada no próprio ficheiro como **DO NOT APPLY**: pressupõe tabelas/colunas antigas e duplicaria estruturas que já existem no schema real.
- `20261112141558_phase2_role_read_scopes.sql` continua a exigir revisão antes de aplicação. No PostgreSQL, policies permissivas de SELECT combinam-se por OR; criar uma policy mais restritiva não neutraliza automaticamente policies antigas.
- A migração que remove `users_directory` é uma correção importante: evita expor uma view SECURITY DEFINER que contornaria RLS.
- As restrições de grants nas tabelas de códigos/sessões e nas sequências devem ser verificadas contra o estado real antes de qualquer rollout.

## Ambiente de execução

O `package-lock.json` fixa `@zxing/browser` com requisito `node >= 24.0.0`. Para instalar e validar o projeto, usar Node.js 24. A versão Node 22 não satisfaz o requisito declarado por essa dependência.

## Validações ainda não comprovadas

- `npm ci` em Node 24.
- `npm run lint`.
- `npx tsc --noEmit`.
- `npm run build`.
- Testes com sessões reais dos cinco perfis.
- Testes negativos: aluno a consultar outro aluno; professor a consultar/alterar presenças fora das suas turmas; Funcionário a tentar escrever; Adjunto a consultar dados reservados ao Administrador.
- Revisão do conjunto completo de policies RLS atualmente existentes na base ativa.

## Próximos passos seguros

1. Executar instalação e verificações em Node 24, sem alterar o schema.
2. Rever todas as policies SELECT antigas e novas por tabela, considerando o efeito OR.
3. Confirmar no Supabase ativo quais as migrações efetivamente aplicadas; não inferir isso a partir da pasta local.
4. Executar a matriz de testes dos cinco perfis e só corrigir o que falhar.
5. Aplicar migrações apenas depois da revisão do SQL e de backup/aceitação explícita.

**Limite desta auditoria:** o repositório GitHub foi consultado e atualizado; não foi executado build remoto nem feita qualquer alteração à base de dados Supabase.

## Resultado da revisão estática das policies e grants (16-11-2026)

### Policies encontradas nas migrações versionadas

- `users_select_own_or_admin`: própria conta ou Administrador, na tabela `users`.
- `logs_select_admin_or_adjunct`: apenas Administrador e Administrador Adjunto, em `logs`.
- `computadores_select_authenticated`: leitura de computadores não Inativos para utilizadores autenticados.
- `*_select_funcionario_read_all`: a migração de Fase 2 cria policies de leitura para Funcionário nas tabelas de catálogo/estrutura escolar listadas no SQL.

Na pesquisa às migrações versionadas não encontrei policies genéricas de SELECT/ALL para `alunos`, `presencas`, `turmas`, `disciplinas` ou `horarios`. Isto é uma conclusão sobre os ficheiros pesquisados no repositório, não uma prova do estado atual da base de dados remota: podem existir policies criadas manualmente ou migrações que não estejam neste repositório.

### Alerta sobre `supabase/schema.sql`

O ficheiro contém policies antigas e muito permissivas, por exemplo políticas de leitura e gestão para qualquer utilizador autenticado em tabelas chamadas `students`, `teachers`, `classes`, `disciplines`, `attendance`, `schedule`, `rooms`, `computers` e `activity_logs`. Também contém grants amplos.

Este schema usa nomes antigos em inglês (`profiles`, `students`, `attendance`, etc.) que não correspondem ao modelo atual em português. Por isso, não deve ser tratado como prova de que essas policies estão aplicadas na base ativa. **Não executar o ficheiro completo** sem reconciliar o schema e remover/rever explicitamente as policies antigas.

### Grants e tabelas sensíveis

- A migração de cursos ativa RLS em `cursos`, revoga acesso de `anon` e `authenticated`, e concede acesso a `service_role`.
- As tabelas `codigos_temporarios`, `sessoes_computador` e `pc_device_credentials` têm RLS ativo; a migração concede operações ao `service_role` e restringe EXECUTE das funções de PC a esse papel.
- A migração de Fase 2 cria a função `private.current_user_is_active()` e concede EXECUTE a `authenticated`; a função exige perfil ativo. A função `private.current_user_role()` é usada pelas policies de utilizador e logs.
- A view `users_directory` é removida numa migração posterior; não deve ser recriada como SECURITY DEFINER sem nova revisão de segurança.

### Conclusão desta etapa

**Não há base suficiente para aplicar ou reescrever policies em produção.** O risco de OR entre policies antigas continua a exigir uma consulta read-only às policies efetivamente instaladas na base Supabase ativa. A pesquisa no GitHub não consegue mostrar policies criadas diretamente no Dashboard nem confirmar que todas as migrações do repositório foram aplicadas.

Consulta necessária no SQL Editor, apenas de leitura:
```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Esta consulta não altera dados nem schema. O resultado permitirá fechar a matriz de policies reais e identificar qualquer policy permissiva adicional antes de propor alterações.
