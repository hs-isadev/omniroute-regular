[CmdletBinding()]
param([string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'OmniRouteRegular'),[switch]$NoShortcuts,[switch]$NoWizard)
$ErrorActionPreference='Stop'
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
if($InstallRoot.Contains('"') -or $InstallRoot -eq [IO.Path]::GetPathRoot($InstallRoot)) {throw 'Invalid install path'}
$payload=Join-Path $PSScriptRoot 'payload'
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
foreach($entry in $manifest.files) {
  $source=[IO.Path]::GetFullPath((Join-Path $payload $entry.path))
  if(-not $source.StartsWith($payload+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {throw 'Unsafe package path'}
  $hasher=[Security.Cryptography.SHA256]::Create(); $stream=[IO.File]::OpenRead($source)
  try {$digest=([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}
  finally {$stream.Dispose(); $hasher.Dispose()}
  if($digest -ne $entry.sha256) {throw ('Package checksum failed: '+$entry.path)}
}
if(Test-Path -LiteralPath (Join-Path $InstallRoot 'installed.json')) {
  Write-Host 'Already installed. Opening Settings.'
  if(-not $NoWizard) { & (Join-Path $InstallRoot 'Settings.ps1') -InstallRoot $InstallRoot }
  return
}
if(Test-Path -LiteralPath $InstallRoot) { throw 'Destination already exists without a completed installation. Choose another InstallRoot; no existing files were changed.' }
$stage=$InstallRoot+'.install-'+[Guid]::NewGuid().ToString('N')
New-Item -ItemType Directory -Path $stage | Out-Null
foreach($entry in $manifest.files) {
  $destination=Join-Path $stage $entry.path
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $payload $entry.path) -Destination $destination
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage 'installed.json') -Encoding UTF8
# Both exact paths are siblings in the selected install parent. Never move data folders.
if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($stage)) -ne [IO.Path]::GetDirectoryName($InstallRoot)) {throw 'Unsafe staging path'}
Move-Item -LiteralPath $stage -Destination $InstallRoot
if(-not $NoShortcuts) {
  $shell=New-Object -ComObject WScript.Shell
  foreach($item in @(@('OmniRoute Regular','Launch.cmd'),@('OmniRoute Regular Settings','Settings.cmd'))) {
    $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) ($item[0]+'.lnk')))
    $shortcut.TargetPath=Join-Path $InstallRoot $item[1]; $shortcut.WorkingDirectory=$InstallRoot; $shortcut.Save()
  }
}
Write-Host ('Installed to '+$InstallRoot)
if(-not $NoWizard) { & (Join-Path $InstallRoot 'Settings.ps1') -InstallRoot $InstallRoot }
