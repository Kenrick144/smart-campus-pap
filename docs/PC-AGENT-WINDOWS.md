# Smart Campus PC Agent — Windows kiosk experience

## Interface e fluxo definidos

O launcher WinForms apresenta-se em ecrã inteiro, sem moldura, sempre no topo e sem controlos de minimizar/fechar. A interface mantém dois comandos disponíveis mesmo antes da autorização:

- **Terminar sessão Windows** — fecha a sessão institucional atual, mesmo que ainda não tenha sido emitido um código.
- **Desligar computador** — inicia o encerramento normal do Windows, mesmo sem sessão Smart Campus ativa.

O código temporário tem seis dígitos, é validado pelo backend e só pode iniciar a sessão no computador a que foi associado. Até a API confirmar o início, o PC Agent não concede a utilização autorizada. O serviço fecha a sessão no backend antes de executar logout ou shutdown quando já existe uma sessão Smart Campus ativa.

## Componentes

- **SmartCampus.Agent.Service** — serviço Windows LocalSystem, credencial do dispositivo protegida por DPAPI, Named Pipe, validação da identidade da sessão de consola, chamadas HTTPS e heartbeat.
- **SmartCampus.Agent.Launcher** — interface WinForms de ecrã inteiro para código, logout e encerramento.
- **SmartCampus.Agent.Provisioning** — configuração inicial como Administrador local, com segredo introduzido interativamente e protegido por DPAPI LocalMachine.

## Importante: ecrã inteiro não é, por si só, um quiosque seguro

O launcher bloqueia atalhos comuns de saída da própria janela, mas não tenta interceptar Ctrl+Alt+Del nem substituir mecanismos de segurança do Windows. Uma aplicação normal não consegue impedir de forma fiável o acesso ao Gestor de Tarefas, alternância de utilizador ou outras vias do sistema.

Para impedir que o aluno contorne o PC Agent, a equipa IT tem de configurar o Windows em modo quiosque e aplicar políticas suportadas para a edição instalada:

- **Windows 11 Pro:** configurar Assigned Access / experiência de várias aplicações, se adequado à versão e aos requisitos da escola, e restringir as aplicações e atalhos permitidos por política. Esta opção não substitui o shell do Windows pelo launcher.
- **Windows 11 Education ou Enterprise:** avaliar Shell Launcher para definir o launcher como shell de uma conta dedicada, com recuperação/reinício quando a aplicação termina. Shell Launcher não está disponível no Windows 11 Pro.
- Manter sempre uma conta IT/administrador separada, não sujeita ao quiosque, e testar recuperação local antes de aplicar a política a todos os PCs.

Não aplicar políticas de teclado, Shell Launcher ou Assigned Access automaticamente durante a instalação do agente. A configuração pode bloquear o acesso administrativo se for aplicada incorretamente. Primeiro validar num PC piloto com procedimento de recuperação documentado.

## Autenticação institucional pendente

O serviço valida o domínio Windows configurado e a identidade da sessão de consola, mas ainda não prova que essa identidade corresponde à mesma pessoa autenticada no Smart Campus. A associação individual requer confirmação da equipa IT (Microsoft Entra ID / Active Directory e identificador imutável do utilizador) e implementação de autenticação institucional correspondente.

## Construir e publicar

Requer .NET SDK 8.0 num Windows ou runner Windows:

    dotnet restore windows-agent/SmartCampus.Agent.sln
    dotnet build windows-agent/SmartCampus.Agent.sln --configuration Release

    $publish = "$PWD\\artifacts\\pc-agent"
    New-Item -ItemType Directory -Force $publish | Out-Null

    dotnet publish windows-agent/SmartCampus.Agent.Service/SmartCampus.Agent.Service.csproj -c Release -r win-x64 --self-contained true -o "$publish\\service"
    dotnet publish windows-agent/SmartCampus.Agent.Launcher/SmartCampus.Agent.Launcher.csproj -c Release -r win-x64 --self-contained true -o "$publish\\launcher"
    dotnet publish windows-agent/SmartCampus.Agent.Provisioning/SmartCampus.Agent.Provisioning.csproj -c Release -r win-x64 --self-contained true -o "$publish\\provisioning"

O workflow `.github/workflows/windows-agent.yml` executa restore e build em runner Windows.

## Enrollment e instalação no PC piloto

1. No painel Smart Campus, Administrador ou Administrador Adjunto regista o computador e copia a credencial apresentada uma única vez.
2. Copia o pacote publicado para o PC através de um canal IT seguro.
3. Executa o provisioning como Administrador local:

       .\\SmartCampus.Agent.Provisioning.exe --computer-id "<UUID_INTERNO_DO_COMPUTADOR>" --api-url "https://<DOMINIO_SMART_CAMPUS>" --allowed-domain "<DOMINIO_WINDOWS_INSTITUCIONAL>"

4. Introduz a credencial quando solicitada; não a coloques em argumentos, scripts, email ou tickets.
5. Executa `install-agent.ps1` como Administrador.
6. Configura o modo quiosque e o arranque automático do launcher apenas depois de confirmar a edição do Windows, a identidade institucional e o procedimento de recuperação.

`computer-id` é o UUID interno de `computadores.id`, não o UUID público do QR. `allowed-domain` tem de corresponder ao domínio devolvido pelo Windows para a sessão de consola; a equipa IT deve observar o valor real no PC piloto.

## Limitações e validações obrigatórias

- O ecrã inteiro e o bloqueio de atalhos comuns não equivalem a um quiosque seguro. Assigned Access / Shell Launcher e políticas IT são uma etapa separada.
- O botão de logout está disponível antes da introdução do código. O botão de desligar também está sempre disponível.
- O shutdown usa o encerramento normal do Windows sem forçar o fecho de aplicações; aplicações podem apresentar pedidos para guardar trabalho.
- A sessão Windows institucional ainda não está ligada a um identificador imutável Microsoft Entra ID / Active Directory.
- WTS atua na sessão de consola física; RDP e ambientes multi-sessão precisam de validação própria.
- As migrações `202611050001_pc_qr_user_code.sql` e `20261111130000_guard_pc_agent_qr_sessions.sql` continuam por aplicar ao Supabase ativo; devem ser revistas em conjunto e aplicadas manualmente por ordem, após confirmação do schema real.
- Antes de produção: testar código inválido/expirado/de outro PC, logout antes e depois da autorização, shutdown, falha de rede, restart do serviço, recuperação do launcher, OneDrive com sincronização pendente, conta IT de recuperação e escape paths do quiosque.
- Não aplicar políticas de quiosque nem migrações ao ambiente ativo sem revisão e autorização.

## Remoção

Revoga primeiro a credencial do computador no Smart Campus. Executa `uninstall-agent.ps1` como Administrador. Só remove os segredos locais com `-RemoveDeviceSecrets` depois da revogação.
