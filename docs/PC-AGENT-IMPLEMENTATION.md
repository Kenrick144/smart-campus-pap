# Smart Campus PC Agent — estado de implementação

> **Estado em 2026-11-05:** fundação documental e rotas iniciais existem na branch, mas ainda não constituem um agente Windows funcional. A auditoria ao Supabase encontrou incompatibilidades críticas; a migração SQL desta branch está marcada como **NÃO APLICAR**.

## Decisões finais confirmadas

- Windows 11 Pro.
- QR permanente físico, único por computador.
- Autenticação Windows com conta institucional individual.
- O código Smart Campus autoriza apenas a sessão do PC; não substitui o login Windows.
- No fim, terminar sessão Windows e libertar o PC.
- Nunca eliminar documentos pessoais ou OneDrive com sincronização pendente.
- Aplicações pretendidas: Microsoft Edge, Word, Excel e Visual Studio Code.
- Perfis que devem poder usar PCs: Aluno, Professor e Funcionário.
- Administrador e Administrador Adjunto gerem o enrollment e as políticas conforme permissões server-side.

## Estado real do trabalho

### Já existe na branch
1. Cliente Supabase administrativo server-only.
2. Rotas iniciais para códigos e início/fim de sessão do agente.
3. Documentação de arquitetura e implementação.
4. PR Draft #2 e issues de acompanhamento.

### Encontrado no Supabase ativo
A auditoria de leitura identificou as tabelas `users`, `computadores`, `codigos_temporarios`, `sessoes_computador` e `pc_device_credentials`. Existem as funções `issue_pc_temporary_code` e `start_pc_session`. O schema real usa `users`, não `profiles`; computadores, códigos e sessões já existem e não devem ser duplicados.

Relatório completo: [PC-AGENT-SUPABASE-AUDIT.md](./PC-AGENT-SUPABASE-AUDIT.md).

## Bloqueios técnicos conhecidos

- A migração `202611020001_pc_agent_foundation.sql` pressupõe `computers` e `profiles`, cria tabelas duplicadas e referencia colunas inexistentes. **Não aplicar.**
- `/api/pc/codes` consulta `profiles`, não associa o código ao computador e não usa a função transacional existente.
- As funções atuais de código/sessão só suportam Aluno; é necessário generalizar o modelo com segurança para Professor e Funcionário.
- Não existe ainda um QR permanente integrado ao registo de computador.
- A credencial do dispositivo já tem uma tabela própria (`pc_device_credentials`); reutilizá-la em vez de criar outra.
- As rotas atuais chamam RPCs que não correspondem às funções reais da base ativa.
- Não existe ainda Windows Agent .NET nem integração real com Windows sign-in, logout ou OneDrive.
- A UI `/pc` continua em modo demo local e não está ligada a estas APIs.

## Implementação QR → código (branch feature, ainda sem migração aplicada)

Já foram acrescentados à branch:
- Migração aditiva `202611050001_pc_qr_user_code.sql`: identificador QR público permanente, associação do código ao computador e suporte user_id para Aluno/Professor/Funcionário.
- `GET /api/pc/lookup/{qrPublicId}`: consulta pública do posto, incluindo ocupação ativa.
- `POST /api/pc/codes`: valida Supabase Auth, resolve o QR, valida perfil e emite código de seis dígitos, 10 minutos, uso único, ligado ao computador.
- `POST /api/pc/agent/start`: valida credencial do dispositivo e código para o mesmo computador numa função transacional.
- `POST /api/pc/agent/end`: valida o dispositivo e termina a sessão Smart Campus.
- Página `/pc/{qrPublicId}`: apresenta o computador e permite gerar/copiar o código.
- Documento de fluxo: [PC-AGENT-QR-FLOW.md](./PC-AGENT-QR-FLOW.md).

**Atenção:** estes ficheiros estão apenas na branch. A migração não foi aplicada; o fluxo não pode ser usado em produção até à revisão SQL, staging e configuração de enrollment de credenciais individuais.

## Próximas fases obrigatórias

1. **Modelo de dados aditivo:** identificador público imutável para QR; associar cada código ao computador solicitado; generalizar proprietário e sessão para os três perfis autorizados sem perder validações específicas de matrícula do Aluno.
2. **Segurança Supabase:** rever grants e EXECUTE, políticas RLS, advisors, concorrência e rollback. Não usar SECURITY DEFINER público como atalho.
3. **API:** usar `users` e funções transacionais reais; validar Supabase Auth, estado do utilizador, perfil, computador, credencial de agente, expiração, single-use e associação código/PC.
4. **QR e enrollment:** gerar URL HTTPS pública com ID opaco; enrollment administrativo gera segredo único por PC, guarda hash no servidor e segredo local protegido por DPAPI.
5. **Windows Agent:** .NET 8 Windows Service + launcher interativo em sessão de utilizador; serviço não deve mostrar UI diretamente (Session 0).
6. **Autenticação institucional:** iniciar na sessão Windows institucional já autenticada; confirmar Entra ID/tenant/licenças e política com IT da escola.
7. **Logout seguro:** terminar sessão Windows através de mecanismo suportado; verificar sincronização OneDrive antes de qualquer limpeza; não apagar documentos do utilizador.
8. **Controlo de aplicações:** testar Assigned Access/AppLocker/WDAC em PC piloto e obter aprovação de IT.
9. **Integração UI e piloto:** remover fluxo demo/localStorage apenas depois de APIs reais, testes e plano de rollback estarem prontos.

## Critérios de aceitação

- QR permanente não dá acesso por si só e não contém segredos.
- Código de 6 dígitos, uso único, validade de 600 segundos, vinculado a um único PC.
- Aluno, Professor e Funcionário são autorizados apenas quando o respetivo estado e regras escolares são válidos.
- Uma sessão ativa por computador; consumo do código e criação da sessão são atómicos.
- O agente só aceita a credencial do seu próprio dispositivo, armazenada localmente com DPAPI.
- O logout termina a sessão Windows sem apagar documentos nem dados OneDrive pendentes.
- Logs não incluem códigos, tokens, passwords ou dados pessoais desnecessários.

## Rollout

Não aplicar qualquer migração ao projeto ativo sem backup, revisão de SQL e aprovação explícita. Não fazer merge do PR Draft #2 até migração, API, testes e piloto estarem validados.

## Enrollment administrativo — implementação inicial

Implementado na branch `feature/pc-agent-foundation`:
- `GET /api/pc/enrollment`: lista salas e computadores, apenas para utilizadores autenticados com perfil `Administrador` ou `Administrador Adjunto`.
- `POST /api/pc/enrollment`: cria o registo em `computadores`, gera um segredo aleatório de 256 bits, guarda apenas o SHA-256 em `pc_device_credentials` e devolve o segredo bruto uma única vez.
- O endpoint valida o JWT com Supabase Auth e confirma o perfil/estado diretamente em `public.users`; não confia em role enviada pelo browser nem em metadados editáveis.
- O painel foi integrado em `/computadores`, permite selecionar sala, registar nome/inventário/marca/modelo, listar PCs, mostrar o QR permanente e imprimir a etiqueta QR.
- A credencial não é colocada no QR. O instalador futuro do agente deverá guardá-la localmente com DPAPI.
- Se a coluna `qr_public_id` ainda não existir, a API bloqueia o registo com HTTP 503 e indica que a migração está pendente.

**Limites atuais:** o segredo é apresentado uma única vez no resultado da operação, mas ainda não existe instalador Windows/DPAPI para o guardar automaticamente. Não há ainda rotação de credencial, auditoria administrativa dedicada ou teste funcional com uma conta institucional real. A migração `202611050001_pc_qr_user_code.sql` continua por aplicar; não executar contra produção sem backup, revisão e autorização.
