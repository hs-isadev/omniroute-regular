[CmdletBinding()]
param([string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'OmniRouteRegular'),[switch]$InstallOnly)
$ErrorActionPreference='Stop'
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
$node=Join-Path $PSScriptRoot 'payload/node/node.exe'
& $node (Join-Path $PSScriptRoot 'payload/app/distribution/install.mjs') install $PSScriptRoot $InstallRoot
if($LASTEXITCODE -ne 0){throw 'Package verification/install failed'}
if($InstallOnly){return}
$active=(Get-Content -LiteralPath (Join-Path $InstallRoot 'active-version.txt') -Raw).Trim()
if($active -notmatch '^versions/[a-zA-Z0-9.-]+$'){throw 'Invalid active version'}
& (Join-Path $InstallRoot ($active+'/app/distribution/dual/bootstrap.ps1')) -InstallRoot $InstallRoot
$shell=New-Object -ComObject WScript.Shell
$desktop=[Environment]::GetFolderPath('Desktop')
foreach($item in @(@('OmniRoute OpenCode','opencode'),@('OmniRoute Antigravity','antigravity'),@('OmniRoute API Keys','keys'),@('OmniRoute Usage','usage'))){
  $shortcut=$shell.CreateShortcut((Join-Path $desktop ($item[0]+'.lnk')))
  $shortcut.TargetPath=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
  $shortcut.Arguments='-NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "'+(Join-Path $InstallRoot 'Launch.ps1')+'" -Action '+$item[1]
  $shortcut.WorkingDirectory=$InstallRoot
  if($item[1] -notin @('opencode','usage')){$shortcut.WindowStyle=7}
  $shortcut.Save()
}
$env:OMNIROUTE_REGULAR_ROOT=$InstallRoot
& (Join-Path $InstallRoot ($active+'/node/node.exe')) (Join-Path $InstallRoot ($active+'/app/distribution/dual-setup.mjs')) setup
if($LASTEXITCODE -ne 0){throw 'Setup needs attention. Your saved keys and pending editor values are preserved.'}
