$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$bundle=Join-Path $repo 'release/OmniRoute-Dual-0.5.1/Windows'
$stage=Join-Path ([IO.Path]::GetTempPath()) ('omniroute-shareable-'+[guid]::NewGuid().ToString('N'))
$root=Join-Path $stage 'install'
& (Join-Path $bundle 'Setup.ps1') -InstallRoot $root -InstallOnly
& (Join-Path $bundle 'Setup.ps1') -InstallRoot $root -InstallOnly
$active=(Get-Content -LiteralPath (Join-Path $root 'active-version.txt') -Raw).Trim()
$node=Join-Path $root ($active+'/node/node.exe')
$app=Join-Path $root ($active+'/app')
$opencode=Join-Path $root ($active+'/opencode/opencode.exe')
& $node --version
& $opencode --version
& (Join-Path $app 'distribution/Settings.ps1') -InstallRoot $root -AppRoot $app -NodePath $node -RuntimeRoot (Join-Path $root 'data') -Simple -SmokeTest
& $node (Join-Path $repo 'scripts/test-dual-opencode.mjs') $opencode
if($LASTEXITCODE -ne 0){throw 'OpenCode tool round trip failed'}
Write-Output ('WINDOWS_TEST_ROOT='+$stage)
