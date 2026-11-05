# Smart Campus PC Agent — arquitetura técnica aprovada

## 1. Decisões de produto

- Sistema operativo dos postos: Windows 11 Pro.
- Modelo: modo de utilização controlado (C) + identidade/perfil individual por utilizador (E).
- Identificação obrigatória do posto: QR Code permanente, único por computador.
- Autorização da sessão Smart Campus: código de 6 dígitos, uso único, validade de 10 minutos.
- Perfis autorizados a utilizar PCs: Aluno, Professor e Funcionário.
- Gestão/enrollment: Administrador e Administrador Adjunto, de acordo com permissões server-side.
- Aplicações pretendidas: Microsoft Edge, Word, Excel e Visual Studio Code.
- Documentos: armazenamento local pessoal + OneDrive.
- Microsoft 365 disponível na escola; plano/licenças, tenant, Entra ID e políticas de dispositivo ainda por confirmar.
- Quantidade inicial de computadores: desconhecida. A solução deve ser configurável por dispositivo e começar com um piloto.

## 2. Princípio de identidade: três camadas distintas

1. **Identidade Smart Campus** — Supabase Auth identifica o utilizador da aplicação; o perfil é lido de fonte server-side confiável.
2. **Identidade Windows/Microsoft 365** — Windows e OneDrive precisam de uma identidade Windows/Microsoft por utilizador para criar perfis separados e sincronizar os ficheiros pessoais.
3. **Identidade do dispositivo** — cada PC Agent possui um identificador e segredo exclusivos, guardado no Windows com DPAPI; o servidor guarda apenas o hash do segredo.

O código Smart Campus autoriza a sessão de utilização do posto. Não é uma palavra-passe Microsoft, não é uma credencial Windows e não deve ser usado como tal. Com o requisito "autenticação: code", o utilizador não precisa de uma segunda palavra-passe dentro do fluxo Smart Campus depois de já estar autenticado na aplicação; contudo, o Windows continua a precisar de uma sessão de utilizador segura. Para contas Windows individuais, a primeira versão deve usar a identidade institucional já aprovada pela escola (idealmente Microsoft Entra ID/Windows sign-in, se o tenant e licenças o permitirem). Não guardar palavras-passe Windows no Smart Campus nem no agente. Um Credential Provider personalizado para substituir o login Windows por um código de seis dígitos fica fora do MVP e exige desenho de segurança próprio.

## 3. QR Code e autorização

### QR permanente (obrigatório no MVP)

- Um QR Code físico por computador, com identificador público opaco ou URL HTTPS para a página do posto.
- A rota abre a ficha do PC (por exemplo, `/pc/<computer-public-id>`), sem incluir segredo, chave de agente, token de sessão ou código temporário.
- O servidor confirma que o posto está ativo e pode ser utilizado.
- O utilizador autentica-se no Smart Campus, seleciona "Iniciar utilização" e recebe um código de 6 dígitos.
- O utilizador introduz o código no ecrã/launcher do computador; o PC Agent envia o código ao endpoint autenticado por segredo do dispositivo.
- O QR apenas identifica o computador; não concede acesso por si só.

### QR dinâmico (não bloquear MVP)

Pode ser acrescentado numa fase posterior para emparelhar o telemóvel com um desafio curto apresentado no ecrã do PC. Se implementado, deve ser aleatório, de utilização única, expirar em poucos minutos e ser vinculado a um computador e a um utilizador autenticado. Não deve substituir a verificação do código nem transportar segredos permanentes. A decisão de incluir este segundo QR fica pendente de validação da experiência do utilizador.

## 4. Fluxo de sessão do MVP

1. PC inicia Windows e abre o ambiente controlado/launcher do Smart Campus.
2. Utilizador lê o QR permanente com o telemóvel.
3. Smart Campus identifica o computador e verifica estado, permissões e disponibilidade.
4. Utilizador já autenticado no Smart Campus solicita uma autorização para esse computador.
5. API gera código aleatório de seis dígitos; guarda apenas hash, user_id, computer_id (ou associação equivalente), created_at e expires_at. O código expira em 600 segundos e é consumido atomicamente uma vez.
6. Utilizador introduz o código no launcher do PC.
7. PC Agent chama a API com computer_id, código e segredo individual do agente.
8. Backend verifica perfil, associação código/PC, expiração, revogação, uso anterior, estado do PC e ausência de sessão ativa. O consumo do código e criação da sessão são atómicos.
9. PC Agent inicia o ambiente/aplicações autorizadas para a identidade Windows ativa e comunica heartbeat.
10. No fim, agente termina a sessão, aplica política de limpeza de dados temporários e o servidor atualiza o estado.

**Importante:** a fundação atual da API de códigos não associa ainda o código a um computer_id; essa ligação deve ser adicionada antes do piloto para impedir que um código solicitado para um PC seja usado noutro, se esse for o comportamento pretendido. A autorização do perfil deve ser verificada no servidor/RPC, não apenas na interface.

## 5. Windows 11 Pro: quiosque e contas individuais

C e E são camadas complementares, mas não significam que o Windows Assigned Access possa ser aplicado sem restrições a qualquer combinação de aplicações.

- Avaliar Windows Assigned Access multi-app para o perfil de utilização controlada.
- Validar Edge, Word, Excel e VS Code na configuração efetiva. Aplicações Win32/Office e atualizações podem exigir regras adicionais.
- Usar AppLocker ou Windows Defender Application Control apenas após piloto, revisão de compatibilidade e aprovação da equipa IT.
- Não permitir que o utilizador comum seja administrador local.
- Manter uma conta administrativa de recuperação, separada e protegida.
- Para perfis individuais, usar contas institucionais Windows/Entra ID ou outro modelo de identidade aprovado pela escola. Não usar uma conta Windows partilhada como substituto de contas individuais.
- Não prometer login Windows apenas com o código Smart Campus no MVP. Isso exigiria integração de autenticação Windows especializada e não é parte da fundação atual.

## 6. OneDrive e Microsoft 365

### Estratégia recomendada para o piloto

- Confirmar que cada utilizador tem licença Microsoft 365 que inclui OneDrive for Business e que o administrador permite a utilização nos PCs da escola.
- Confirmar se os computadores podem ser associados ao Microsoft Entra ID e se existe Intune ou outra gestão de dispositivos. Microsoft 365 disponível não confirma, por si só, licenças Intune ou gestão centralizada.
- Cada utilizador inicia sessão no Windows com a sua identidade institucional; o cliente OneDrive sincroniza para o perfil Windows desse utilizador.
- Ativar Known Folder Move (Documentos/Ambiente de Trabalho, se aprovado) através de políticas institucionais, depois de testar conflitos e recuperação.
- Guardar localmente apenas dentro do perfil individual e aplicar permissões NTFS.
- Não guardar refresh tokens, passwords ou credenciais Microsoft no PC Agent.
- Não usar uma conta OneDrive partilhada entre alunos.
- Para integração direta no portal Smart Campus via Microsoft Graph, criar uma aplicação Entra ID com permissões delegadas mínimas e fluxo OAuth apropriado. Esta integração é opcional; não é necessária para o primeiro piloto se a sincronização OneDrive do Windows for suficiente.

### Comportamento offline

Os ficheiros sincronizados e marcados para disponibilidade local podem continuar acessíveis sem rede; as alterações sincronizam quando a ligação regressa. O agente não deve apagar ficheiros pertencentes ao OneDrive. A limpeza no fim da sessão deve limitar-se a dados temporários explicitamente definidos.

## 7. Componentes e responsabilidades

| Componente | Responsabilidade |
|---|---|
| Next.js 16 | UI, rotas de QR, APIs server-side |
| Supabase Auth | Identidade Smart Campus |
| PostgreSQL/RLS | Perfis, computadores, códigos, sessões e auditoria |
| PC Agent (.NET 8 Worker/launcher) | Identidade do dispositivo, validação de sessão, heartbeat e ciclo de vida |
| Windows 11 Pro | Sessão individual, políticas de aplicações e isolamento local |
| Microsoft Entra ID (se disponível) | Identidade institucional Windows e associação do dispositivo |
| OneDrive for Business | Sincronização e persistência dos trabalhos pessoais |

## 8. Modelo de dados a validar antes de alterar

Não assumir que todas estas entidades precisam de tabelas novas. Inspecionar o schema atual e reutilizar o que existe.

- `profiles`: ligação entre auth user e perfil institucional; avaliar campo para Entra object ID.
- `computers`: UUID, identificador público para QR, sala, estado, versão do agente, última comunicação e hash da chave do agente.
- `pc_access_codes`: hash do código, user_id, computer_id associado, expiração, used_at e revoked_at.
- `pc_sessions`: computer_id, user_id, timestamps, estado e motivo de fim.
- Registos de QR, aplicações e auditoria: reutilizar tabelas existentes ou criar apenas após confirmar necessidade.

A migração atual `202611020001_pc_agent_foundation.sql` pressupõe colunas em `computers` (`estado`, `utilizador`, `utilizacao`) e tipos específicos. Não a aplicar até comparar com o schema real, verificar constraints/enum e fazer backup. Rever também as funções `SECURITY DEFINER`: manter execução apenas para service_role, search_path restrito e validações server-side explícitas.

## 9. Fases de entrega

### Fase 0 — Auditoria e decisões de ambiente
- Inspecionar schema Supabase, RLS, perfis e QR atual.
- Confirmar Microsoft 365 tenant, licenças OneDrive, Entra ID, Intune (se houver), contas Windows e políticas da escola.
- Definir computador piloto e responsável IT.
- Corrigir documentação de demonstração (15 minutos/localStorage) para não contradizer a política de 10 minutos.

### Fase 1 — Backend e QR
- Validar schema e adaptar migração.
- Ligar códigos à identidade e ao computer_id.
- Implementar autorização e consumo atómico.
- Criar rota de QR permanente e página do computador.
- Sanitizar erros públicos das APIs.
- Definir heartbeat e timeout de agente.

### Fase 2 — PC Agent e launcher
- Criar solução .NET 8 Windows Service + processo launcher/interativo separado (serviço Windows não deve tentar mostrar UI diretamente na sessão de utilizador).
- Enrollment por administrador, chave individual e DPAPI.
- Cliente HTTPS com validação TLS, retry/backoff e logs sem segredos.
- Fluxos start/end/heartbeat e recuperação após reinício.
- Launcher apresenta campo de código e aplicações permitidas.

### Fase 3 — Windows e Microsoft 365
- Preparar conta de teste institucional.
- Testar Entra ID join/sign-in conforme licenças e política.
- Configurar Assigned Access multi-app ou alternativa validada.
- Testar AppLocker/WDAC apenas em modo auditoria antes de enforcement.
- Configurar OneDrive por utilizador e testar sincronização, isolamento e offline.
- Validar Word/Excel e licenciamento; Edge e VS Code conforme instalação local.

### Fase 4 — Integração UI e piloto
- Remover dependência de localStorage no fluxo real.
- Integrar geração de código e QR no Smart Campus.
- Mostrar estados, sessões e logs.
- Testar perfis Aluno, Professor e Funcionário.
- Testar código expirado, reutilizado, PC errado, PC ocupado, offline e reinício.
- Só expandir para mais computadores depois de aprovação do piloto.

## 10. Critérios de aceitação do piloto

- QR permanente identifica apenas o computador correto.
- Um utilizador autenticado e autorizado consegue pedir código para esse computador.
- Código expira em 600 segundos e só pode ser usado uma vez.
- Código não funciona noutro computador se estiver vinculado ao PC.
- Um computador não aceita duas sessões simultâneas.
- PC Agent autentica-se com segredo individual protegido por DPAPI.
- Segredos nunca aparecem no browser, logs ou repositório.
- Sessão termina corretamente e estado do PC é atualizado.
- Cada utilizador tem acesso apenas ao seu perfil e documentos.
- OneDrive sincroniza para a identidade individual e não é partilhado entre alunos.
- Falhas de rede não apagam trabalhos nem deixam sessões permanentemente ocupadas.
- Políticas de quiosque não bloqueiam manutenção e recuperação autorizadas.

## 11. Bloqueios e riscos por resolver

1. Schema real Supabase ainda não foi validado contra a migração existente.
2. O código atual não está ainda associado a um computador.
3. A documentação e README contêm comportamento de demonstração antigo (15 minutos/localStorage).
4. O modo Assigned Access e as quatro aplicações precisam de teste no Windows real.
5. "Microsoft 365 disponível" não confirma licença OneDrive para cada utilizador, Entra ID/Intune nem políticas de dispositivos.
6. O método de autenticação Windows individual precisa de ser confirmado com a escola; código Smart Campus não substitui credenciais Windows.
7. Número de computadores é desconhecido; implementar enrollment por dispositivo e configuração sem pressupor quantidade.
