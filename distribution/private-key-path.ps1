[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference='Stop'
if(-not [IO.Path]::IsPathRooted($Target)) {throw 'Absolute private path required'}
$item=Get-Item -LiteralPath $Target -Force
if($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {throw 'Reparse path denied'}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
if($item.PSIsContainer) {
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
} else {
  $acl=New-Object Security.AccessControl.FileSecurity
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')
}
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true,$false)
$acl.AddAccessRule($rule)
if($item.PSIsContainer) {[IO.Directory]::SetAccessControl($Target,$acl)}
else {[IO.File]::SetAccessControl($Target,$acl)}
