param(
    [Parameter(Mandatory = $true)]
    [string]$PublishDirectory,
    [string]$InstallDirectory = "$env:ProgramFiles\SmartCampus\Agent"
)

$ErrorActionPreference = "Stop"
$configPath = "$env:ProgramData\SmartCampus\agent.json"
if (-not (Test-Path $configPath)) {
    throw "Configuração não encontrada. Executa primeiro SmartCampus.Agent.Provisioning.exe como Administrador."
}
$serviceSource = Join-Path $PublishDirectory "service"
$launcherSource = Join-Path $PublishDirectory "launcher"
if (-not (Test-Path (Join-Path $serviceSource "SmartCampus.Agent.Service.exe"))) { throw "Ficheiros do serviço não encontrados." }
if (-not (Test-Path (Join-Path $launcherSource "SmartCampus.Agent.Launcher.exe"))) { throw "Ficheiros do launcher não encontrados." }

New-Item -ItemType Directory -Force -Path $InstallDirectory | Out-Null
Copy-Item (Join-Path $serviceSource "*") $InstallDirectory -Recurse -Force
$launcherDirectory = Join-Path $InstallDirectory "Launcher"
New-Item -ItemType Directory -Force -Path $launcherDirectory | Out-Null
Copy-Item (Join-Path $launcherSource "*") $launcherDirectory -Recurse -Force

$serviceExe = Join-Path $InstallDirectory "SmartCampus.Agent.Service.exe"
if (Get-Service -Name "SmartCampusPCAgent" -ErrorAction SilentlyContinue) {
    Stop-Service -Name "SmartCampusPCAgent" -Force -ErrorAction SilentlyContinue
    sc.exe delete "SmartCampusPCAgent" | Out-Null
    Start-Sleep -Seconds 2
}
New-Service -Name "SmartCampusPCAgent" -BinaryPathName ('"' + $serviceExe + '"') -DisplayName "Smart Campus PC Agent" -Description "Gestão segura das sessões Smart Campus neste computador." -StartupType Automatic
Start-Service -Name "SmartCampusPCAgent"

$shortcutPath = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "Smart Campus.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $launcherDirectory "SmartCampus.Agent.Launcher.exe"
$shortcut.WorkingDirectory = $launcherDirectory
$shortcut.Description = "Autorizar utilização deste computador no Smart Campus"
$shortcut.Save()

Write-Host "Smart Campus PC Agent instalado. A credencial permanece protegida em ProgramData."
