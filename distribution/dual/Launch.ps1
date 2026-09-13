[CmdletBinding()]
param([ValidateSet('opencode','antigravity','keys','usage','setup')][string]$Action='opencode',[Parameter(ValueFromRemainingArguments=$true)][string[]]$Extra)
$ErrorActionPreference='Stop'
$guiAction=$Action -in @('antigravity','keys')
try {
  $active=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'active-version.txt') -Raw).Trim()
  if($active -notmatch '^versions/[a-zA-Z0-9.-]+$'){throw 'Invalid active version'}
  $env:OMNIROUTE_REGULAR_ROOT=$PSScriptRoot
  $node=Join-Path $PSScriptRoot ($active+'/node/node.exe')
  $entry=Join-Path $PSScriptRoot ($active+'/app/distribution/dual-setup.mjs')
  if($guiAction){$launchOutput=(& $node $entry $Action @Extra 2>&1 | Out-String)}else{& $node $entry $Action @Extra}
  if($LASTEXITCODE -ne 0){throw ('OmniRoute launch failed. '+$launchOutput)}
} catch {
  $details=$_.Exception.Message
  if($guiAction){
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($details,'OmniRoute needs attention') | Out-Null
  }else{Write-Host $details; Read-Host 'Press Enter to close' | Out-Null}
  exit 1
}
