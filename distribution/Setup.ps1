[CmdletBinding()]
param([string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'OmniRouteRegular'),[switch]$NoShortcuts,[switch]$NoWizard)
$ErrorActionPreference='Stop'
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
Write-Host 'Step 1/4: Verify and install OmniRoute Regular (existing keys are retained).'
& (Join-Path $PSScriptRoot 'payload/node/node.exe') (Join-Path $PSScriptRoot 'payload/app/distribution/install.mjs') install $PSScriptRoot $InstallRoot
if($LASTEXITCODE -ne 0) {throw 'Installation failed. Existing user data was retained.'}
if(-not $NoShortcuts) {
  $shell=New-Object -ComObject WScript.Shell
  foreach($item in @(@('OmniRoute Regular','Launch.cmd'),@('OmniRoute Regular Settings','Settings.cmd'),@('OmniRoute Regular Finish Setup','Connect.cmd'))) {
    $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) ($item[0]+'.lnk')))
    $shortcut.TargetPath=Join-Path $InstallRoot $item[1]; $shortcut.WorkingDirectory=$InstallRoot; $shortcut.Save()
  }
}
Write-Host 'Install/sign in to official Antigravity: https://antigravity.google/download'
Write-Host 'No account tokens are imported. Select a free account-available host model in Antigravity.'
Write-Host 'Connect.cmd resumes guided key entry, workspace preview and launch at any time.'
if(-not $NoWizard) { & (Join-Path $InstallRoot 'Connect.ps1') }
