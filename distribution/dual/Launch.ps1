[CmdletBinding()]
param([ValidateSet('opencode','antigravity','keys','usage','setup')][string]$Action='opencode',[Parameter(ValueFromRemainingArguments=$true)][string[]]$Extra)
$ErrorActionPreference='Stop'
$active=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'active-version.txt') -Raw).Trim()
if($active -notmatch '^versions/[a-zA-Z0-9.-]+$'){throw 'Invalid active version'}
$env:OMNIROUTE_REGULAR_ROOT=$PSScriptRoot
& (Join-Path $PSScriptRoot ($active+'/node/node.exe')) (Join-Path $PSScriptRoot ($active+'/app/distribution/dual-setup.mjs')) $Action @Extra
if($LASTEXITCODE -ne 0){Write-Host 'Setup or launch needs attention. No paid fallback was enabled.'; Read-Host 'Press Enter to close' | Out-Null}
