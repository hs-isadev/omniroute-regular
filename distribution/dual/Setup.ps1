[CmdletBinding()]
param([string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'OmniRouteRegular'),[switch]$InstallOnly)
$ErrorActionPreference='Stop'
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
function Get-VerifiedDevinCli {
  $segments=@([Environment]::GetEnvironmentVariable('Path','Machine'),[Environment]::GetEnvironmentVariable('Path','User'),$env:Path) | Where-Object { $_ }
  $env:Path=($segments -join ';')
  $command=Get-Command devin -CommandType Application -ErrorAction SilentlyContinue
  if($null -eq $command){return $null}
  $signature=Get-AuthenticodeSignature -LiteralPath $command.Source
  if($signature.Status -cne 'Valid' -or $signature.SignerCertificate.Subject -cne 'CN="Exafunction, Inc.", O="Exafunction, Inc.", L=Mountain View, S=California, C=US'){return $null}
  return $command.Source
}
$node=Join-Path $PSScriptRoot 'payload/node/node.exe'
& $node (Join-Path $PSScriptRoot 'payload/app/distribution/install.mjs') install $PSScriptRoot $InstallRoot
if($LASTEXITCODE -ne 0){throw 'Package verification/install failed'}
if($InstallOnly){return}
$active=(Get-Content -LiteralPath (Join-Path $InstallRoot 'active-version.txt') -Raw).Trim()
if($active -notmatch '^versions/[a-zA-Z0-9.-]+$'){throw 'Invalid active version'}
& (Join-Path $InstallRoot ($active+'/app/distribution/dual/bootstrap.ps1')) -InstallRoot $InstallRoot
$shell=New-Object -ComObject WScript.Shell
$desktop=[Environment]::GetFolderPath('Desktop')
$startMenu=Join-Path $env:APPDATA 'Microsoft/Windows/Start Menu/Programs/OmniRoute'
New-Item -ItemType Directory -Path $startMenu -Force | Out-Null
foreach($location in @($desktop,$startMenu)){
  foreach($item in @(@('OmniRoute OpenCode','opencode'),@('OmniRoute Antigravity','antigravity'),@('OmniRoute Devin CLI','devin'),@('OmniRoute API Keys','keys'),@('OmniRoute Usage','usage'))){
    $shortcut=$shell.CreateShortcut((Join-Path $location ($item[0]+'.lnk')))
    $shortcut.TargetPath=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $shortcut.Arguments='-NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "'+(Join-Path $InstallRoot 'Launch.ps1')+'" -Action '+$item[1]
    $shortcut.WorkingDirectory=$InstallRoot
    if($item[1] -notin @('opencode','usage','devin')){$shortcut.Arguments='-WindowStyle Hidden '+$shortcut.Arguments;$shortcut.WindowStyle=7}
    $shortcut.Save()
  }
}
$env:OMNIROUTE_REGULAR_ROOT=$InstallRoot
& (Join-Path $InstallRoot ($active+'/node/node.exe')) (Join-Path $InstallRoot ($active+'/app/distribution/dual-setup.mjs')) setup
if($LASTEXITCODE -ne 0){throw 'Setup needs attention. Your saved keys and pending editor values are preserved.'}
$devin=Get-VerifiedDevinCli
if($devin){
  $launcher=Join-Path $InstallRoot 'Launch.ps1'
  $arguments='-NoLogo -NoProfile -ExecutionPolicy Bypass -File "'+$launcher+'" -Action devin'
  Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') -ArgumentList $arguments
}
