param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-p]{32}$')]
  [string]$ExtensionId
)

$ErrorActionPreference = 'Stop'
$HostName = 'com.gfg.traversal_lab'
$HostRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$InstallDir = Join-Path $env:LOCALAPPDATA 'GFGTraversalLab'
$ManifestPath = Join-Path $InstallDir "$HostName.json"
$BinaryPath = Join-Path $InstallDir 'gfg-traversal-native-host.exe'

cargo build --release --manifest-path (Join-Path $HostRoot 'Cargo.toml')
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Force (Join-Path $HostRoot 'target\release\gfg-traversal-native-host.exe') $BinaryPath

$Manifest = [ordered]@{
  name = $HostName
  description = 'GFG Traversal Lab OS input companion'
  path = $BinaryPath
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
}
$ManifestJson = $Manifest | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText($ManifestPath, $ManifestJson, [System.Text.UTF8Encoding]::new($false))
$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
New-Item -Force $RegistryPath | Out-Null
Set-Item -Path $RegistryPath -Value $ManifestPath

Write-Host "Installed $HostName for Chrome extension $ExtensionId. Restart Chrome."
