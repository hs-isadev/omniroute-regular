[CmdletBinding()]
param(
  [string]$SourcePath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")),
  [string]$RuntimeRoot = (Join-Path $env:LOCALAPPDATA "OmniRoute"),
  [switch]$Apply,
  [switch]$SkipVerification,
  [switch]$SkipService,
  [switch]$SkipPathUpdate,
  [ValidateSet("None", "AfterPromotion", "AfterSetup", "AfterServiceInstall")]
  [string]$FailureInjection = "None"
)

$ErrorActionPreference = "Stop"
$sourceRoot = [IO.Path]::GetFullPath($SourcePath)
$runtimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$appRoot = Join-Path $runtimeRoot "app"
$binRoot = Join-Path $runtimeRoot "bin"
$stagingRoot = Join-Path $runtimeRoot ("install-staging-" + [Guid]::NewGuid().ToString("N"))
$backupRoot = Join-Path $runtimeRoot ("backups\app-" + (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ"))

if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot "package.json") -PathType Leaf)) {
  throw "SourcePath is not an OmniRoute source tree: $sourceRoot"
}
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { throw "LOCALAPPDATA is unavailable" }

$nodeVersion = (& node --version)
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.') { throw "Node.js is unavailable" }
if ([int]$Matches[1] -lt 22) { throw "OmniRoute requires Node.js 22 or newer; found $nodeVersion" }
& npm --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "npm is unavailable" }

$plan = [ordered]@{
  source = $sourceRoot
  application = $appRoot
  commandDirectory = $binRoot
  runtimeData = $runtimeRoot
  verifies = -not $SkipVerification
  startup = "Current-user Task Scheduler logon task"
  elevationRequired = $false
}
$plan | ConvertTo-Json
if (-not $Apply) {
  Write-Host "Dry run only. Re-run with -Apply to install."
  exit 0
}

New-Item -ItemType Directory -Force -Path $stagingRoot, $binRoot | Out-Null
$shimPath = Join-Path $binRoot "omni.cmd"
$hadPreviousApp = Test-Path -LiteralPath $appRoot
$previousShimExists = Test-Path -LiteralPath $shimPath -PathType Leaf
$previousShim = if ($previousShimExists) { [IO.File]::ReadAllBytes($shimPath) } else { $null }
$previousUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
$previousOmniHome = $env:OMNIROUTE_HOME
$appBackedUp = $false
$appPromoted = $false
$serviceTouched = $false
try {
  $excludedDirectories = @('.git', 'node_modules', 'dist', 'runtime', 'logs', 'backups', 'state', '.runtime-test')
  $secretPatterns = @('credentials.txt', 'credentials.*.txt', '*.credentials', '*.credentials.*', '*.secrets', '*.secrets.*', 'secret*.txt', '*.key', '*.pem', '*.p12', '*.pfx', 'vault.json', '*.vault', '.env', '.env.*')
  foreach ($file in Get-ChildItem -LiteralPath $sourceRoot -Recurse -File) {
    $relative = $file.FullName.Substring($sourceRoot.Length).TrimStart('\', '/')
    $parts = $relative -split '[\\/]'
    if ($parts | Where-Object { $excludedDirectories -contains $_ }) { continue }
    if ($secretPatterns | Where-Object { $file.Name -like $_ }) { continue }
    $destination = Join-Path $stagingRoot $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination
  }

  Push-Location $stagingRoot
  try {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    if (-not $SkipVerification) {
      & npm run check
      if ($LASTEXITCODE -ne 0) { throw "OmniRoute verification failed" }
    } else {
      & npm run build
      if ($LASTEXITCODE -ne 0) { throw "OmniRoute build failed" }
    }
  } finally { Pop-Location }

  if (Test-Path -LiteralPath $appRoot) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupRoot) | Out-Null
    Move-Item -LiteralPath $appRoot -Destination $backupRoot
    $appBackedUp = $true
  }
  Move-Item -LiteralPath $stagingRoot -Destination $appRoot
  $appPromoted = $true
  if ($FailureInjection -eq "AfterPromotion") { throw "Injected failure after application promotion" }

  $cliPath = Join-Path $appRoot "apps\cli\dist\bin.js"
  $shim = "@echo off`r`n`"$([IO.Path]::GetFullPath((Get-Command node).Source))`" `"$cliPath`" %*`r`n"
  [IO.File]::WriteAllText($shimPath, $shim, [Text.UTF8Encoding]::new($false))
  if (-not $SkipPathUpdate) {
    $pathParts = @($previousUserPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($pathParts -notcontains $binRoot) {
      [Environment]::SetEnvironmentVariable("Path", (($pathParts + $binRoot) -join ';'), "User")
    }
  }

  $env:OMNIROUTE_HOME = $runtimeRoot
  & node $cliPath setup
  if ($LASTEXITCODE -ne 0) { throw "omni setup failed" }
  if ($FailureInjection -eq "AfterSetup") { throw "Injected failure after setup" }
  if (-not $SkipService) {
    $serviceTouched = $true
    & node $cliPath service install --apply
    if ($LASTEXITCODE -ne 0) { throw "OmniRoute startup task installation failed" }
    if ($FailureInjection -eq "AfterServiceInstall") { throw "Injected failure after service installation" }
    & node $cliPath service start
    if ($LASTEXITCODE -ne 0) { throw "OmniRoute startup task could not be started" }
  }
  $env:OMNIROUTE_HOME = $previousOmniHome
  Write-Host "OmniRoute installed for the current user. Open a new terminal, then run: omni doctor"
  Write-Host "Credential import file: $runtimeRoot\import\credentials.txt"
} catch {
  $env:OMNIROUTE_HOME = $previousOmniHome
  if ($serviceTouched -and -not $hadPreviousApp) {
    try { & (Join-Path $sourceRoot "installers\windows\service-task.ps1") -Action uninstall } catch { Write-Warning "Could not remove the newly registered startup task during rollback" }
  }
  if ($appPromoted -and (Test-Path -LiteralPath $appRoot)) { Remove-Item -LiteralPath $appRoot -Recurse -Force }
  if ($appBackedUp -and (Test-Path -LiteralPath $backupRoot)) { Move-Item -LiteralPath $backupRoot -Destination $appRoot }
  if ($previousShimExists -and $null -ne $previousShim) { [IO.File]::WriteAllBytes($shimPath, $previousShim) }
  elseif (Test-Path -LiteralPath $shimPath) { Remove-Item -LiteralPath $shimPath -Force }
  if (-not $SkipPathUpdate) { [Environment]::SetEnvironmentVariable("Path", $previousUserPath, "User") }
  if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
  throw
}
