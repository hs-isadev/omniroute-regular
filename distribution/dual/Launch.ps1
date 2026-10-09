[CmdletBinding()]
param([ValidateSet('opencode','antigravity','devin','keys','usage','setup','harness')][string]$Action='opencode',[Parameter(ValueFromRemainingArguments=$true)][string[]]$Extra)
$ErrorActionPreference='Stop'
$guiAction=$Action -in @('antigravity','keys')
function Test-DevinPublisher($signature) {
  $certificate=$signature.SignerCertificate
  return $signature.Status -eq 'Valid' -and $null -ne $certificate -and $certificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -ieq 'Exafunction, Inc.' -and $certificate.Subject -match '(?i)(?:^|,\s*)O\s*=\s*"?Exafunction,\s*Inc\.?"?(?:\s*,|$)'
}
try {
  $active=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'active-version.txt') -Raw).Trim()
  if($active -notmatch '^versions/[a-zA-Z0-9.-]+$'){throw 'Invalid active version'}
  $env:OMNIROUTE_REGULAR_ROOT=$PSScriptRoot
  if($Action -eq 'devin'){
    $segments=@([Environment]::GetEnvironmentVariable('Path','Machine'),[Environment]::GetEnvironmentVariable('Path','User'),$env:Path) | Where-Object { $_ }
    $env:Path=($segments -join ';')
    $devin=Get-Command devin -CommandType Application -ErrorAction Stop
    $signature=Get-AuthenticodeSignature -LiteralPath $devin.Source
    if(-not(Test-DevinPublisher $signature)){throw 'The installed Devin CLI signature could not be verified.'}
    $env:OMNIROUTE_DEVIN_EXECUTABLE=$devin.Source
  }
  $node=Join-Path $PSScriptRoot ($active+'/node/node.exe')
  if(-not(Test-Path -LiteralPath $node -PathType Leaf)){throw 'The active OmniRoute Node runtime is missing. Rerun Install-Windows.cmd to repair the package.'}
  if($Action -eq 'harness'){
    $entry=Join-Path $PSScriptRoot ($active+'/app/apps/cli/dist/bin.js')
    if(-not(Test-Path -LiteralPath $entry -PathType Leaf)){throw 'The bundled OmniRoute CLI is missing. Rerun Install-Windows.cmd to repair the package.'}
    if(-not $Extra -or $Extra.Count -eq 0){$Extra=@('opencode','--mode','regular')}
    & $node $entry 'harness' @Extra
  }else{
    $entry=Join-Path $PSScriptRoot ($active+'/app/distribution/dual-setup.mjs')
    if(-not(Test-Path -LiteralPath $entry -PathType Leaf)){throw 'The active OmniRoute launcher is missing. Rerun Install-Windows.cmd to repair the package.'}
    if($guiAction){$launchOutput=(& $node $entry $Action @Extra 2>&1 | Out-String)}else{& $node $entry $Action @Extra}
  }
  if($LASTEXITCODE -ne 0){throw ('OmniRoute launch failed. '+$launchOutput)}
} catch {
  $details=$_.Exception.Message
  if($guiAction){
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($details,'OmniRoute needs attention') | Out-Null
  }else{Write-Host $details; Read-Host 'Press Enter to close' | Out-Null}
  exit 1
}
