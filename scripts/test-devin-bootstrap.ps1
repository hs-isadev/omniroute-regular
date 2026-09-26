param(
  [Parameter(Mandatory=$true)][string]$BootstrapPath,
  [Parameter(Mandatory=$true)][string]$TestRoot
)
$ErrorActionPreference='Stop'
$TestRoot=[IO.Path]::GetFullPath($TestRoot)
$global:mockInstallerHash='0000000000000000000000000000000000000000000000000000000000000000'
$global:signatureCalls=0
$global:installerRuns=0
$global:downloadCalls=0

function Get-FileHash {
  param([string]$LiteralPath,[string]$Algorithm)
  [pscustomobject]@{ Algorithm='SHA256'; Hash=$global:mockInstallerHash }
}
function Get-AuthenticodeSignature {
  param([string]$LiteralPath)
  $global:signatureCalls++
  [pscustomobject]@{
    Status='Valid'
    SignerCertificate=[pscustomobject]@{Subject='CN="Exafunction, Inc.", O="Exafunction, Inc.", L=Mountain View, S=California, C=US'}
  }
}
function Start-Process {
  param([string]$FilePath,[string[]]$ArgumentList,[switch]$Wait,[switch]$PassThru)
  $global:installerRuns++
  [pscustomobject]@{ExitCode=0}
}
function Invoke-WebRequest {
  param([string]$Uri,[string]$OutFile)
  $global:downloadCalls++
  [IO.File]::WriteAllText($OutFile,'fixture download')
}

$localAppData=Join-Path $TestRoot 'LocalAppData'
$installRoot=Join-Path $TestRoot 'InstallRoot'
$antigravity=Join-Path $localAppData 'Programs/antigravity/Antigravity.exe'
$download=Join-Path $installRoot 'downloads'
$cachedInstaller=Join-Path $download 'Devin-CLI-x86_64.exe'
New-Item -ItemType Directory -Path (Split-Path $antigravity),$download -Force | Out-Null
[IO.File]::WriteAllText($antigravity,'fixture')
[IO.File]::WriteAllText($cachedInstaller,'fixture')
$env:LOCALAPPDATA=$localAppData
$env:PROCESSOR_ARCHITECTURE='AMD64'

if(Get-Command devin -CommandType Application -ErrorAction SilentlyContinue){
  throw 'This isolated test requires no Devin CLI on the host PATH.'
}
$bootstrapSource=[IO.File]::ReadAllText($BootstrapPath)
if($bootstrapSource -notmatch 'C52356D07CE4E23E7768E87562FECB974EFAC6F4A65E112B938CCCF9A043B9CE'){
  throw 'The package does not pin the currently verified official Devin updater checksum.'
}

& $BootstrapPath -InstallRoot $installRoot

if($global:signatureCalls -ne 0){throw 'A mismatched installer reached Authenticode verification unexpectedly.'}
if($global:installerRuns -ne 0){throw 'A mismatched installer was executed.'}
if($global:downloadCalls -ne 1){throw "A stale cached Devin installer was not replaced for retry (download calls: $global:downloadCalls)."}
Write-Output 'PASS: a Devin checksum mismatch skips the optional installer, refreshes stale cache, and lets bootstrap continue.'
