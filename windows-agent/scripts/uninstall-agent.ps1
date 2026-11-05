param(
    [switch]$RemoveDeviceSecrets,
    [string]$InstallDirectory = "$env:ProgramFiles\SmartCampus\Agent"
)

$ErrorActionPreference = "Stop"
Stop-Service -Name "SmartCampusPCAgent" -Force -ErrorAction SilentlyContinue
if (Get-Service -Name "SmartCampusPCAgent" -ErrorAction SilentlyContinue) {
    sc.exe delete "SmartCampusPCAgent" | Out-Null
}
$shortcutPath = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "Smart Campus.lnk"
Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
Remove-Item $InstallDirectory -Recurse -Force -ErrorAction SilentlyContinue

if ($RemoveDeviceSecrets) {
    Write-Warning "Confirma primeiro que a credencial foi revogada no painel Smart Campus."
    Remove-Item "$env:ProgramData\SmartCampus" -Recurse -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "Configuração e segredo DPAPI preservados em ProgramData. Revoga a credencial no Smart Campus antes de os remover."
}
