# PC Agent — QR permanente e autorização por computador

## QR permanente

Cada registo em `public.computadores` recebe um `qr_public_id` UUID aleatório, único e sem significado operacional. O QR impresso aponta para:

`https://<dominio-da-escola>/pc/<qr_public_id>`

O identificador é público e apenas localiza o computador. Não é token de autenticação, não inicia sessões e não deve conter credenciais.

API de consulta pública:
- `GET /api/pc/lookup/{qrPublicId}`
- Devolve nome, sala, estado de inventário e se o computador está operacional.
- Não devolve UUID interno, email, utilizador atual, segredo de dispositivo ou informação de sessão.

## Emissão de código

O utilizador autentica-se primeiro no Smart Campus com Supabase Auth. O cliente envia:
- `Authorization: Bearer <access_token>`
- `POST /api/pc/codes`
- JSON: `{ "qr_public_id": "<uuid do QR>" }`

O servidor:
1. valida o token com `auth.getUser`;
2. consulta `public.users` e confirma estado Ativo e perfil Aluno, Professor ou Funcionário;
3. resolve o QR para o registo `computadores` e exige estado Operacional;
4. gera código aleatório de seis dígitos e guarda apenas SHA-256;
5. chama `issue_pc_temporary_code`, que faz rate limit (5 por 15 minutos), valida a elegibilidade e grava o código associado ao `computador_id`, com validade de 600 segundos.

O código é apresentado uma única vez. Nunca é escrito em logs.

## Validação pelo agente

`POST /api/pc/agent/start` recebe `computer_id` e código, mais a credencial do agente em `x-pc-agent-key`. O servidor envia apenas hashes para `pc_agent_start_session`. A função:
- valida a credencial ativa de `pc_device_credentials` para aquele computador;
- valida código não usado, não revogado, não expirado e associado ao mesmo computador;
- revalida o perfil e o estado escolar;
- impede sessão ativa duplicada por utilizador e por computador;
- cria a sessão e consome o código na mesma transação.

## Fim da sessão

`POST /api/pc/agent/end` valida a credencial do mesmo dispositivo e termina apenas uma sessão pertencente a esse computador. O motivo normal é `desligado`. A chamada de API apenas fecha a sessão Smart Campus; o agente Windows deve terminar a sessão Windows por mecanismo próprio e só depois confirmar o fim. Não apagar pastas OneDrive nem documentos do utilizador.

## Migração e rollout

A migração `202611050001_pc_qr_user_code.sql` é aditiva e dirigida ao schema real auditado. Está no GitHub, mas **não foi aplicada** ao Supabase. Antes de aplicar:
1. backup;
2. confirmar zero registos órfãos ao preencher `user_id`;
3. rever SQL e RLS/grants;
4. testar numa base de staging;
5. obter autorização do responsável técnico da escola.

## Limitações atuais

- A página visual `/pc/[qrPublicId]`, o painel de enrollment e a impressão do QR já estão na branch feature.
- Existe uma primeira solução Windows .NET 8 com serviço, launcher, provisioning DPAPI e endpoints start/end/heartbeat; ainda não foi compilada/testada num PC Windows real.
- A ligação inequívoca entre a identidade Windows/Entra ID e a conta Smart Campus ainda não está implementada. O agente valida apenas o domínio Windows permitido, pelo que não deve ser usado em produção até esta associação ser resolvida.
- O agente não apaga ficheiros OneDrive, mas o comportamento de sincronização pendente e logout ainda precisa de teste no PC piloto.
- O fluxo existente de demonstração em localStorage não deve ser usado como prova de integração real.

## Enrollment e impressão do QR

O painel `/computadores` inclui o registo administrativo inicial:
- Só Administrador e Administrador Adjunto podem consultar ou registar computadores.
- Cada PC recebe um segredo aleatório individual; o servidor persiste apenas o hash SHA-256.
- O segredo bruto é apresentado uma única vez e não faz parte do QR.
- O QR contém apenas o URL público `/pc/{qr_public_id}` e pode ser impresso como etiqueta.
- A operação depende da migração que cria `computadores.qr_public_id`; enquanto esta não estiver aplicada, a API devolve HTTP 503. Não aplicar a migração sem revisão e autorização.

A instalação e armazenamento DPAPI da credencial estão implementados como base técnica em `windows-agent/`; faltam CI verde, validação do domínio com IT, associação Windows/Entra ID ao utilizador Smart Campus e testes no PC piloto.
