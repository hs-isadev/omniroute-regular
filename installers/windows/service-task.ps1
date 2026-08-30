param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("install", "start", "status", "uninstall")]
  [string]$Action,
  [string]$NodePath,
  [string]$DaemonPath
)

$ErrorActionPreference = "Stop"
$taskName = "OmniRoute"
$service = New-Object -ComObject "Schedule.Service"
$service.Connect()
$root = $service.GetFolder("\")

if ($Action -eq "status") {
  try {
    $task = $root.GetTask($taskName)
    [Console]::Out.Write((@{ installed = $true; state = [int]$task.State; lastRunTime = $task.LastRunTime.ToUniversalTime().ToString("o"); lastTaskResult = $task.LastTaskResult } | ConvertTo-Json -Compress))
  } catch {
    [Console]::Out.Write('{"installed":false}')
  }
  exit 0
}

if ($Action -eq "uninstall") {
  try { $root.DeleteTask($taskName, 0) } catch { if ($_.Exception.Message -notmatch "cannot find") { throw } }
  exit 0
}

if ($Action -eq "start") {
  $task = $root.GetTask($taskName)
  [void]$task.Run($null)
  exit 0
}

if ([string]::IsNullOrWhiteSpace($NodePath) -or [string]::IsNullOrWhiteSpace($DaemonPath)) {
  throw "NodePath and DaemonPath are required for install"
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $identity.User.Value
$workingDirectory = Split-Path -Parent $DaemonPath
$launcherPath = Join-Path $PSScriptRoot 'daemon-hidden.vbs'
$scriptHost = Join-Path $env:SystemRoot 'System32\wscript.exe'
foreach ($requiredPath in @($NodePath, $DaemonPath, $launcherPath, $scriptHost)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw "Missing daemon launcher component: $requiredPath" }
  if ($requiredPath.Contains('"')) { throw 'Daemon launcher paths cannot contain quotes' }
}
$escapedNode = [Security.SecurityElement]::Escape($scriptHost)
$escapedArgs = [Security.SecurityElement]::Escape(('//B //Nologo "{0}" "{1}" "{2}"' -f $launcherPath, $NodePath, $DaemonPath))
$escapedWork = [Security.SecurityElement]::Escape($workingDirectory)
$escapedSid = [Security.SecurityElement]::Escape($sid)

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>OmniRoute current-user local routing daemon, console-free supervised startup</Description><URI>\OmniRoute</URI></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>$escapedSid</UserId></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>$escapedSid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle><WakeToRun>false</WakeToRun><ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author"><Exec><Command>$escapedNode</Command><Arguments>$escapedArgs</Arguments><WorkingDirectory>$escapedWork</WorkingDirectory></Exec></Actions>
</Task>
"@

# TASK_CREATE_OR_UPDATE = 6, TASK_LOGON_INTERACTIVE_TOKEN = 3.
[void]$root.RegisterTask($taskName, $xml, 6, $null, $null, 3, $null)
