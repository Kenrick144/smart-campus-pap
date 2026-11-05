# Auditoria do schema Supabase — PC Agent

Data da auditoria: 2026-11-05  
Projeto Supabase ativo: `Smart Campus` (`cttezawyrqxxxwuhcash`, região `eu-central-1`, PostgreSQL 17.6).  
**Esta auditoria foi apenas de leitura. Não foi aplicada qualquer migração nem alterada a base de dados.**

## Decisões confirmadas pelo utilizador

- QR: permanente, colocado fisicamente em cada computador.
- Autenticação Windows: conta institucional individual.
- Fim da utilização: terminar sessão Windows e libertar o PC.
- O QR é um identificador público do computador, nunca uma credencial.
- O código Smart Campus autoriza a sessão do posto; não substitui a autenticação Windows.
- O encerramento não pode apagar documentos do utilizador nem dados OneDrive ainda não sincronizados.

## Estrutura real encontrada

A base não corresponde à migração inicial do PC Agent. Usa nomes em português e já contém um subsistema de computadores:

| Tabela | Colunas relevantes | Observações |
|---|---|---|
| `users` | `id`, `email`, `name`, `role`, `status` | FK para `auth.users`; os cinco perfis já estão no CHECK, incluindo Administrador Adjunto. |
| `computadores` | `id`, `sala_id`, `nome`, `numero_inventario`, `estado` | UUID como PK. Estados atuais: Operacional, Em manutenção, Avariado, Inativo. |
| `codigos_temporarios` | `id`, `aluno_id`, `codigo_hash`, `created_at`, `expires_at`, `used_at`, `revoked_at` | Só está modelado para alunos. |
| `sessoes_computador` | `id`, `computador_id`, `aluno_id`, `codigo_id`, `started_at`, `heartbeat_at`, `ended_at`, `ended_reason` | Só associa sessões a alunos. |
| `pc_device_credentials` | `id`, `computador_id`, `token_hash`, `created_at`, `last_seen_at`, `revoked_at` | Já existe credencial por dispositivo, única por computador. |
| `salas` | `id`, `nome`, ... | Relação de computadores à sala já existe. |

Todas estas tabelas têm RLS ativo. Não existe tabela `profiles`, nem tabela `qr_codes` no schema público inspecionado.

## Funções já existentes

### `issue_pc_temporary_code(p_aluno_id, p_codigo_hash, p_expires_at)`

- Usa `users` + `alunos` para validar perfil Aluno e estado Ativo.
- Exige matrícula ativa em `alunos_turmas`.
- Aplica limite de 5 códigos em 15 minutos.
- Expira códigos anteriores não usados e cria um novo.
- Valida hash SHA-256 e expiração máxima de 11 minutos.
- Faz lock transacional por aluno.
- É SECURITY INVOKER, com `search_path = public, pg_temp`.

### `start_pc_session(p_computador_id, p_codigo_hash)`

- Bloqueia a linha do computador.
- Exige estado Operacional.
- Valida o código, expiração e utilização única.
- Confirma Aluno ativo e matrícula ativa.
- Impede sessão ativa duplicada por aluno ou computador.
- Cria a sessão e marca o código como usado na mesma transação.
- É SECURITY INVOKER, com `search_path = public, pg_temp`.

Estas funções existentes são uma base mais adequada do que duplicar o fluxo com novas tabelas genéricas, mas ainda não suportam Professor e Funcionário.

## RLS observado

Na consulta às políticas das tabelas do PC foram encontradas:
- `computadores_select_authenticated`: SELECT autenticado para computadores cujo estado não seja Inativo.
- `users_select_own_or_admin`: SELECT do próprio utilizador ou Administrador.

Não foram devolvidas políticas para `codigos_temporarios`, `sessoes_computador` ou `pc_device_credentials`. Com RLS ativo e sem políticas, o acesso direto via Data API fica bloqueado por omissão; o serviço privilegiado deve continuar apenas no servidor.

As funções existentes são SECURITY INVOKER. Não substituir por SECURITY DEFINER sem uma necessidade demonstrada. Qualquer função privilegiada futura deve ficar com EXECUTE restrito e ser revista com os advisors.

## Incompatibilidades da implementação inicial na branch

A migração `202611020001_pc_agent_foundation.sql` não deve ser aplicada:
1. Refere `public.computers`, mas a tabela real é `public.computadores`.
2. Refere `public.profiles`, mas o perfil real está em `public.users`.
3. Cria `pc_access_codes` e `pc_sessions`, duplicando `codigos_temporarios` e `sessoes_computador`.
4. Pressupõe colunas `estado`, `utilizador` e `utilizacao` com valores/tipos que não existem na tabela real.
5. A lógica da migração inicial não associa o código ao computador pretendido.
6. A API `/api/pc/codes` consulta `profiles`, gera código fora da função transacional existente e não recebe `computer_id`.
7. A API de início/fim chama RPCs que não correspondem às funções reais já existentes.

## Plano de adaptação — sem aplicar ainda

1. **Reutilizar as tabelas atuais.** Não criar uma segunda tabela de computadores, códigos ou sessões.
2. **QR permanente.** Acrescentar, numa migração futura, um identificador público opaco e único ao computador (ou tabela dedicada, se a auditoria de QR justificar). O QR contém apenas URL HTTPS e identificador público; nunca token do agente, segredo, UUID de sessão ou código temporário.
3. **Códigos associados ao PC.** Acrescentar `computador_id` a `codigos_temporarios` com FK para `computadores`; alterar a função de emissão e a de início para validar a correspondência do computador atomicamente.
4. **Perfis autorizados.** Generalizar o proprietário de código/sessão de `aluno_id` para `user_id` com FK para `users`, ou introduzir uma relação explícita equivalente. Preservar as validações específicas de matrícula para Aluno e definir regras equivalentes para Professor e Funcionário. Não contornar a estrutura existente com um campo de texto.
5. **Credenciais do agente.** Reutilizar `pc_device_credentials`; o token bruto só existe no processo de enrollment e fica protegido localmente por DPAPI. A base guarda apenas hash.
6. **Identidade institucional Windows.** Associar o utilizador Smart Campus à identidade institucional aprovada pela escola (preferencialmente Entra ID, se a escola o tiver). Não armazenar palavras-passe Windows no agente.
7. **Logout seguro.** O launcher/serviço termina a sessão Windows através do mecanismo suportado pelo Windows. Antes de remover perfil ou dados locais, confirmar sincronização OneDrive; nunca apagar a pasta OneDrive nem documentos do utilizador.
8. **Estados.** Manter o estado de inventário atual (`Operacional`, `Em manutenção`, `Avariado`, `Inativo`) e representar disponibilidade/sessão (Livre, Ocupado, Reservado, Offline) sem misturar conceitos.

## Bloqueios antes de implementação de produção

- Confirmar a política da escola para identidade Windows institucional e disponibilidade de Entra ID/Intune.
- Rever grants/EXECUTE e advisors das tabelas e funções atuais.
- Definir como Professor e Funcionário recebem acesso, porque o modelo atual de código/sessão só contempla Aluno.
- Definir o ciclo de sincronização OneDrive antes do logout e eventual limpeza do perfil.
- Fazer backup e revisão/aceitação da migração antes de qualquer aplicação no projeto ativo.

## Segurança e estado

- Auditoria apenas de leitura; nenhuma alteração na base de dados.
- Não aplicar a migração inicial.
- Não fazer merge do PR.
- A branch de trabalho continua `feature/pc-agent-foundation`.
