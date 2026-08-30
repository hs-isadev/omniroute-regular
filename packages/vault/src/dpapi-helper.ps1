param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("protect", "unprotect")]
  [string]$Operation
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Security

$raw = [Console]::In.ReadToEnd().Trim()
if ([string]::IsNullOrWhiteSpace($raw)) {
  throw "DPAPI input is empty"
}

$bytes = [Convert]::FromBase64String($raw)
$entropy = [Text.Encoding]::UTF8.GetBytes("OmniRoute/v1/master-key")
$result = $null

try {
  if ($Operation -eq "protect") {
    $result = [Security.Cryptography.ProtectedData]::Protect(
      $bytes,
      $entropy,
      [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
  } else {
    $result = [Security.Cryptography.ProtectedData]::Unprotect(
      $bytes,
      $entropy,
      [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
  }
  [Console]::Out.Write([Convert]::ToBase64String($result))
} finally {
  if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
  if ($entropy) { [Array]::Clear($entropy, 0, $entropy.Length) }
  if ($result) { [Array]::Clear($result, 0, $result.Length) }
  $raw = $null
}
