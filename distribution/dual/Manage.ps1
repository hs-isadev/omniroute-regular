[CmdletBinding()]
param([ValidateSet('rollback','uninstall')][string]$Action)
$ErrorActionPreference='Stop'
if(-not $Action){throw 'Use Manage.ps1 rollback or uninstall.'}
$active=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'active-version.txt') -Raw).Trim()
if($active -notmatch '^versions/[a-zA-Z0-9.-]+$'){throw 'Invalid active version'}
$node=Join-Path $PSScriptRoot ($active+'/node/node.exe')
$install=Join-Path $PSScriptRoot ($active+'/app/distribution/install.mjs')
$repair=Join-Path $PSScriptRoot ($active+'/app/distribution/dual-setup.mjs')
if(-not(Test-Path -LiteralPath $node)){throw 'OmniRoute registration unhealthy: active Node executable is missing.'}
& $node $install $Action $PSScriptRoot
if($LASTEXITCODE -ne 0){throw "OmniRoute $Action failed."}
if($Action -eq 'rollback'){
  $next=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'active-version.txt') -Raw).Trim()
  if($next -notmatch '^versions/[a-zA-Z0-9.-]+$'){throw 'Invalid rollback version'}
  $nextNode=Join-Path $PSScriptRoot ($next+'/node/node.exe')
  if(-not(Test-Path -LiteralPath $nextNode) -or -not(Test-Path -LiteralPath $repair)){throw 'Rollback runtime is incomplete; host registrations were not changed.'}
  & $node $repair repair-hosts
  if($LASTEXITCODE -ne 0){throw 'Rollback selected the previous version, but host registration repair failed.'}
}
