[CmdletBinding()]
param([string]$Destination = (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\OmniRoute-Regular-0.2.6'))
$ErrorActionPreference = 'Stop'
$version = 'v0.2.6-regular.4'
$archive = 'OmniRoute-Regular-0.2.6-windows-x64.zip'
$base = "https://github.com/hs-isadev/omniroute-regular/releases/download/$version"
$destination = [IO.Path]::GetFullPath($Destination)
if ([IO.Path]::GetPathRoot($destination) -eq $destination) { throw 'Choose a non-root destination directory.' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$zip = Join-Path $destination $archive
$checksum = "$zip.sha256"
Write-Host "Downloading OmniRoute Regular $version..."
Invoke-WebRequest -Uri "$base/$archive" -OutFile $zip
Invoke-WebRequest -Uri "$base/$archive.sha256" -OutFile $checksum
$expected = (Get-Content -LiteralPath $checksum -Raw).Trim().Split([char]::WhiteSpace)[0].ToLowerInvariant()
$actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'SHA-256 verification failed; the archive was not opened.' }
Expand-Archive -LiteralPath $zip -DestinationPath $destination -Force
$bundle = Join-Path $destination 'OmniRoute-Regular-0.2.6-windows-x64'
$setup = Join-Path $bundle 'Setup.cmd'
if (-not (Test-Path -LiteralPath $setup -PathType Leaf)) { throw 'The verified archive did not contain Setup.cmd.' }
Write-Host 'Verified archive extracted. Starting the one-click setup...'
$process = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\cmd.exe') -ArgumentList @('/d','/c',"`"$setup`"") -WorkingDirectory $bundle -PassThru -Wait
if ($process.ExitCode -ne 0) { throw 'OmniRoute Setup.cmd failed.' }
