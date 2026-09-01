param([Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference='Stop'
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
