[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$LiveRoot)
$ErrorActionPreference='Stop'
$sourceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$LiveRoot=[IO.Path]::GetFullPath($LiveRoot)
if($LiveRoot -eq [IO.Path]::GetPathRoot($LiveRoot) -or -not (Test-Path -LiteralPath (Join-Path $LiveRoot 'apps\cli\dist\bin.js'))) {throw 'Not an OmniRoute application folder'}
# Do not replace unrelated edits. This update is based on the copied baseline.
foreach($relative in @('packages/config/src/provider-catalog.ts','tests/cli.test.ts')) {
  $old=[IO.File]::ReadAllText((Join-Path $LiveRoot $relative)).Replace("`r`n","`n").TrimEnd()
  $baseline=(& git -C $sourceRoot show ('f278ce5:'+$relative) | Out-String).Replace("`r`n","`n").TrimEnd()
  if($LASTEXITCODE -ne 0 -or $old -ne $baseline) {throw ('Existing edits require review: '+$relative)}
}
$backup=Join-Path $sourceRoot ('.build\live-provider-backup-'+[Guid]::NewGuid().ToString('N'))
$files=@('packages/config/src/provider-catalog.ts','tests/cli.test.ts','distribution/settings.mjs','distribution/Settings.ps1','docs/free-provider-expansion.md')
$files+=Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'packages\config\dist') -File | Where-Object {$_.Name -like 'provider-catalog.*'} | ForEach-Object {'packages/config/dist/'+$_.Name}
foreach($relative in $files) {
  $target=Join-Path $LiveRoot $relative
  if(Test-Path -LiteralPath $target) {
    $saved=Join-Path $backup $relative
    New-Item -ItemType Directory -Path (Split-Path $saved -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $target -Destination $saved
  }
}
$node=(Get-Command node.exe -ErrorAction Stop).Source
$cli=Join-Path $LiveRoot 'apps\cli\dist\bin.js'
& $node $cli service stop
if($LASTEXITCODE -ne 0) {throw 'Could not stop router safely'}
try {
  foreach($relative in $files) {
    $target=Join-Path $LiveRoot $relative
    New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot $relative) -Destination $target
  }
} finally { & $node $cli service start }
if($LASTEXITCODE -ne 0) {throw 'Updated files; service restart needs attention'}
$desktop=[Environment]::GetFolderPath('Desktop')
$shortcutPath=Join-Path $desktop 'OmniRoute Provider Keys.lnk'
if(Test-Path -LiteralPath $shortcutPath) {Copy-Item -LiteralPath $shortcutPath -Destination (Join-Path $backup 'previous-provider-keys-shortcut.lnk')}
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$script=Join-Path $LiveRoot 'distribution\Settings.ps1'
$runtime=Join-Path $env:LOCALAPPDATA 'OmniRoute'
$shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$script+'" -AppRoot "'+$LiveRoot+'" -NodePath "'+$node+'" -RuntimeRoot "'+$runtime+'" -ExistingSetup'
$shortcut.WorkingDirectory=$LiveRoot
$shortcut.Description='Add your own free-provider API keys without changing routing mode or existing credentials'
$shortcut.Save()
Write-Output ('Updated application; source backup: '+$backup)
Write-Output ('Key-entry shortcut: '+$shortcutPath)
