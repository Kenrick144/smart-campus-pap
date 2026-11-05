# Smart Campus PC Agent — Windows 11 Pro

## Componentes entregues na branch

A solução .NET 8 está em windows-agent/SmartCampus.Agent.sln e contém três executáveis:

- **SmartCampus.Agent.Service** — Windows Service executado como LocalSystem. Guarda a credencial do dispositivo, recebe pedidos do launcher por Named Pipe, comunica com as APIs HTTPS e envia heartbeat de 30 em 30 segundos.
- **SmartCampus.Agent.Launcher** — interface WinForms para introduzir o código de seis dígitos e pedir o fim da sessão Windows.
- **SmartCampus.Agent.Provisioning** — ferramenta de configuração inicial, executada como Administrador local. Recebe a credencial do enrollment sem a colocar na linha de comandos, protege-a com DPAPI LocalMachine e restringe os ficheiros em ProgramData\SmartCampus a SYSTEM e Administrators.

A comunicação local usa o pipe SmartCampusAgent. A credencial do dispositivo nunca é enviada ao launcher nem escrita nos logs. O serviço compara a identidade da sessão de consola Windows com o domínio institucional configurado.

## APIs usadas

- POST /api/pc/agent/start — código + segredo do dispositivo; inicia sessão Smart Campus.
- POST /api/pc/agent/heartbeat — atualiza heartbeat da sessão e last_seen_at.
- POST /api/pc/agent/end — termina a sessão Smart Campus.
- Todos os pedidos do agente usam x-pc-agent-key sobre HTTPS. O servidor calcula SHA-256 e valida a credencial ativa associada ao computador.

## Construir e publicar

Requer .NET SDK 8.0 num Windows ou runner Windows:

    dotnet restore windows-agent/SmartCampus.Agent.sln
    dotnet build windows-agent/SmartCampus.Agent.sln --configuration Release

    $publish = "$PWD\artifacts\pc-agent"
    New-Item -ItemType Directory -Force $publish | Out-Null

    dotnet publish windows-agent/SmartCampus.Agent.Service/SmartCampus.Agent.Service.csproj -c Release -r win-x64 --self-contained true -o "$publish\service"
    dotnet publish windows-agent/SmartCampus.Agent.Launcher/SmartCampus.Agent.Launcher.csproj -c Release -r win-x64 --self-contained true -o "$publish\launcher"
    dotnet publish windows-agent/SmartCampus.Agent.Provisioning/SmartCampus.Agent.Provisioning.csproj -c Release -r win-x64 --self-contained true -o "$publish\provisioning"

O workflow .github/workflows/windows-agent.yml faz restore e build em windows-latest para alterações na pasta do agente.

## Enrollment e instalação no PC piloto

1. No painel Smart Campus, o Administrador ou Administrador Adjunto regista o computador e copia a credencial de dispositivo apresentada uma única vez.
2. Copia o pacote publicado para o PC Windows 11 Pro através de um canal IT seguro. Não coloques a credencial em scripts, argumentos de processo, email ou ticket.
3. Abre PowerShell como Administrador e executa a ferramenta de provisioning (a credencial é solicitada de forma interativa):

       .\SmartCampus.Agent.Provisioning.exe --computer-id "<UUID_INTERNO_DO_COMPUTADOR>" --api-url "https://<DOMINIO_SMART_CAMPUS>" --allowed-domain "<DOMINIO_WINDOWS_INSTITUCIONAL>"

4. Executa o instalador como Administrador:

       .\install-agent.ps1 -PublishDirectory "C:\Caminho\pc-agent"

5. O serviço é instalado como SmartCampusPCAgent e o atalho Smart Campus é criado no ambiente de trabalho público.
6. Testa primeiro com uma conta institucional e código temporário válido.

computer-id é o UUID interno de computadores.id, não o UUID público do QR. allowed-domain tem de corresponder exatamente ao domínio devolvido pelo Windows Terminal Services para a sessão de consola. Em ambientes Microsoft Entra ID, a equipa IT deve confirmar o valor observado no PC piloto (não assumir automaticamente que o nome do tenant é o domínio reportado pelo Windows).

## Fluxo de utilização

1. O utilizador inicia sessão no Windows com a conta institucional individual.
2. Abre o atalho Smart Campus.
3. Lê o QR permanente no telemóvel, autentica-se no portal e pede um código para aquele PC.
4. Introduz o código de seis dígitos no launcher.
5. O serviço confirma que existe sessão Windows de consola e que o domínio corresponde ao domínio institucional configurado; depois pede a autorização ao backend.
6. O serviço envia heartbeat de 30 em 30 segundos.
7. Ao escolher Terminar sessão e sair do Windows, o serviço fecha primeiro a sessão Smart Campus no backend e só depois solicita o logout da sessão de consola Windows.
8. Se a sessão Windows desaparecer ou mudar, o agente tenta fechar a sessão Smart Campus com motivo timeout.

## Estado e recuperação

- O identificador da sessão e o utilizador Windows associados são persistidos cifrados com DPAPI LocalMachine em ProgramData\SmartCampus\active-session.bin, permitindo recuperar a sessão após reinício do serviço.
- O ficheiro da credencial é cifrado com DPAPI LocalMachine em ProgramData\SmartCampus\agent.secret.
- A configuração não contém o segredo bruto.
- O script uninstall-agent.ps1 preserva os segredos por omissão. Só os remove quando é passado -RemoveDeviceSecrets, depois de revogar a credencial no painel.
- O agente não apaga perfis Windows, pastas OneDrive, Documentos, Ambiente de Trabalho ou ficheiros pessoais. A sincronização OneDrive continua sob controlo do cliente Microsoft no perfil individual.

## Limitações e validações obrigatórias antes de piloto

- O serviço ainda não foi compilado/testado num runner Windows nesta sessão; o workflow GitHub Actions deve confirmar a compilação.
- O domínio Windows institucional ainda precisa de confirmação com IT no PC piloto.
- A chamada WTS usada para logout atua na sessão de consola física. O suporte a sessões RDP e ambientes multi-sessão requer validação separada.
- O Named Pipe aceita utilizadores Windows autenticados localmente. A autorização efetiva continua a depender do código Smart Campus de uso único e da validação transacional do servidor.
- O serviço não altera políticas Assigned Access, AppLocker, WDAC, Microsoft 365 ou OneDrive.
- A instalação real depende da migração 202611050001_pc_qr_user_code.sql e do enrollment de cada PC. A migração continua por aplicar ao projeto Supabase ativo.
- Antes de produção: validar logs/event viewer, restart/recovery, falha de rede, expiração de código, código de outro PC, utilizador Windows não institucional, logout, OneDrive com sincronização pendente e rollback.
- O instalador é uma base de piloto técnico, não um pacote MSI assinado nem um mecanismo de atualização automática.

## Remoção

Executa como Administrador:

    .\uninstall-agent.ps1

Revoga primeiro a credencial do computador no Smart Campus. Só depois, se necessário, remove também a configuração protegida:

    .\uninstall-agent.ps1 -RemoveDeviceSecrets
