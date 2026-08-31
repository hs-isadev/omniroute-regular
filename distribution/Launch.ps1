$ErrorActionPreference='Stop'
$active=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'active-version.txt') -Raw).Trim()
if($active -notmatch '^versions/[a-zA-Z0-9.-]+$') {throw 'Invalid active version'}
$env:OMNIROUTE_REGULAR_ROOT=$PSScriptRoot
& (Join-Path $PSScriptRoot ($active+'/node/node.exe')) (Join-Path $PSScriptRoot ($active+'/app/distribution/launch.mjs')) @args
exit $LASTEXITCODE
