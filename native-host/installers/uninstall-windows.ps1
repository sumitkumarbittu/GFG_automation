$ErrorActionPreference = 'Stop'
$HostName = 'com.gfg.traversal_lab'
$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
$InstallDir = Join-Path $env:LOCALAPPDATA 'GFGTraversalLab'

if (Test-Path $RegistryPath) { Remove-Item -Recurse -Force $RegistryPath }
if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
Write-Host 'Removed the GFG Traversal Lab native companion.'

