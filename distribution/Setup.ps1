[CmdletBinding()]
param([string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'OmniRouteRegular'),[switch]$NoShortcuts,[switch]$NoWizard)
$ErrorActionPreference='Stop'
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
& (Join-Path $PSScriptRoot 'payload/node/node.exe') (Join-Path $PSScriptRoot 'payload/app/distribution/install.mjs') install $PSScriptRoot $InstallRoot
if($LASTEXITCODE -ne 0) {throw 'Installation failed. Existing user data was retained.'}
if(-not $NoShortcuts) {
  $shell=New-Object -ComObject WScript.Shell
  foreach($item in @(@('OmniRoute Regular','Launch.cmd'),@('OmniRoute Regular Settings','Settings.cmd'))) {
    $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) ($item[0]+'.lnk')))
    $shortcut.TargetPath=Join-Path $InstallRoot $item[1]; $shortcut.WorkingDirectory=$InstallRoot; $shortcut.Save()
  }
}
Write-Host 'Install/sign in to official Antigravity: https://antigravity.google/download'
Write-Host 'No account tokens are imported. Select a free account-available host model in Antigravity.'
Write-Host 'After Settings, run Launch.cmd --workspace "C:\path\to\project" to preview; add --apply to connect and open.'
if(-not $NoWizard) { & (Join-Path $InstallRoot 'Settings.ps1') -InstallRoot $InstallRoot }
