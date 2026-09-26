param([Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference='Stop'
function Refresh-OmniRoutePath {
  $segments=@(
    [Environment]::GetEnvironmentVariable('Path','Machine'),
    [Environment]::GetEnvironmentVariable('Path','User'),
    $env:Path
  ) | Where-Object { $_ }
  $env:Path=($segments -join ';')
}
function Get-VerifiedDevinCli {
  Refresh-OmniRoutePath
  $command=Get-Command devin -CommandType Application -ErrorAction SilentlyContinue
  if($null -eq $command){return $null}
  $candidate=$command.Source
  $signature=Get-AuthenticodeSignature -LiteralPath $candidate
  if($signature.Status -cne 'Valid' -or $signature.SignerCertificate.Subject -cne 'CN="Exafunction, Inc.", O="Exafunction, Inc.", L=Mountain View, S=California, C=US'){return $null}
  return $candidate
}
function Install-VerifiedDevinCli {
  if(Get-VerifiedDevinCli){return $true}
  if($env:PROCESSOR_ARCHITECTURE -notmatch 'AMD64'){
    Write-Warning 'The optional Devin CLI installer in this x64 desktop bundle is unavailable on this architecture.'
    return $false
  }
  $download=Join-Path $InstallRoot 'downloads'
  New-Item -ItemType Directory -Path $download -Force | Out-Null
  $installer=Join-Path $download 'Devin-CLI-x86_64.exe'
  $expectedHash='C52356D07CE4E23E7768E87562FECB974EFAC6F4A65E112B938CCCF9A043B9CE'
  if((Test-Path -LiteralPath $installer) -and (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $expectedHash){
    Remove-Item -LiteralPath $installer -Force
  }
  if(-not(Test-Path -LiteralPath $installer)){
    Invoke-WebRequest -Uri 'https://static.devin.ai/cli/devin-updater-x86_64-pc-windows.exe' -OutFile $installer
  }
  if((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $expectedHash){
    throw 'Official Devin CLI installer checksum failed.'
  }
  $signature=Get-AuthenticodeSignature -LiteralPath $installer
  if($signature.Status -cne 'Valid' -or $signature.SignerCertificate.Subject -cne 'CN="Exafunction, Inc.", O="Exafunction, Inc.", L=Mountain View, S=California, C=US'){
    throw 'Official Devin CLI installer signature failed.'
  }
  $process=Start-Process -FilePath $installer -Wait -PassThru
  if($process.ExitCode -ne 0){
    Write-Warning 'The optional official Devin CLI installer needs attention. OmniRoute setup will continue unchanged.'
    return $false
  }
  if(-not(Get-VerifiedDevinCli)){
    Write-Warning 'The optional Devin CLI could not be verified after installation. OmniRoute did not register it.'
    return $false
  }
  return $true
}
$app=Join-Path $env:LOCALAPPDATA 'Programs/antigravity/Antigravity.exe'
if(-not(Test-Path -LiteralPath $app)){
  $download=Join-Path $InstallRoot 'downloads'
  New-Item -ItemType Directory -Path $download -Force | Out-Null
  $installer=Join-Path $download 'Antigravity-2.11.0-x64.exe'
  if(-not(Test-Path -LiteralPath $installer)){Invoke-WebRequest -Uri 'https://storage.googleapis.com/antigravity-public/antigravity-hub/2.11.0-6376446768316416/windows-x64/Antigravity-x64.exe' -OutFile $installer}
  if((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne 'F2FC7CEF680B71336C0C2C27AA55BC9DBFED85ADAFD14864CA4EDB40D5390CBB'){throw 'Google installer checksum failed'}
  $signature=Get-AuthenticodeSignature -LiteralPath $installer
  if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Google LLC'){throw 'Google installer signature failed'}
  # Google 2.11.0 is a user-scoped Nullsoft installer (official Winget manifest).
  $installProcess=Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
  if($installProcess.ExitCode -ne 0){throw 'Google installer needs attention. No reboot or billing changes were requested.'}
  if(-not(Test-Path -LiteralPath $app)){throw 'Complete the Google installer, then rerun Setup. OpenCode was installed successfully.'}
}
if(-not(Get-Command git -ErrorAction SilentlyContinue)){
  if(Get-Command winget -ErrorAction SilentlyContinue){
    & winget install --id Git.Git --exact --source winget --accept-source-agreements --accept-package-agreements --silent
    if($LASTEXITCODE -ne 0){throw 'Git installation needs OS approval. Install Git for Windows, then rerun Setup.'}
  }else{throw 'Git for Windows is required for OpenCode coding tools. Install it and rerun Setup.'}
}
try {
  $null=Install-VerifiedDevinCli
} catch {
  Write-Warning ("Optional Devin CLI setup was skipped; OmniRoute setup will continue. " + $_.Exception.Message)
}
