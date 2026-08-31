param([ValidateSet('rollback','uninstall')][string]$Action)
$ErrorActionPreference='Stop'
if(-not $Action) {throw 'Use Manage.ps1 rollback or uninstall. Detach workspace MCP first using Launch.cmd --detach --workspace PATH --apply.'}
$active=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'active-version.txt') -Raw).Trim()
if($active -notmatch '^versions/[a-zA-Z0-9.-]+$') {throw 'Invalid active version'}
& (Join-Path $PSScriptRoot ($active+'/node/node.exe')) (Join-Path $PSScriptRoot ($active+'/app/distribution/install.mjs')) $Action $PSScriptRoot
exit $LASTEXITCODE
