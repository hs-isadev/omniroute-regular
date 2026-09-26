param(
    [string]$AdapterDir = "$PSScriptRoot\.."
)

$ErrorActionPreference = "Stop"

$TaskName = "OmniRouteBrowserConsumer"
$TaskDescription = "Auto-starts OmniRoute Browser Consumer Adapter (6 free AI providers) on user logon."
$ActionPath = "$AdapterDir\scripts\start-session.bat"

if (-Not (Test-Path $ActionPath)) {
    Write-Error "start-session.bat not found at $ActionPath"
    exit 1
}

# Register the task to run at logon
$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/C `"$ActionPath`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

# Remove existing task if it exists
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
    -TaskName $TaskName `
    -Description $TaskDescription `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal | Out-Null

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Autostart configured successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Task Name:  $TaskName"
Write-Host "Trigger:    User logon"
Write-Host "Action:     $ActionPath"
Write-Host ""
Write-Host "The browser consumer session will now auto-start when you sign in to Windows."
Write-Host ""
Write-Host "To disable autostart, run:"
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
Write-Host ""
Write-Host "To test now, run:"
Write-Host "  cmd /C `"$ActionPath`""
Write-Host ""

# Offer to test the setup immediately
$test = Read-Host "Start the session now? (Y/N)"
if ($test -eq 'Y' -or $test -eq 'y') {
    & cmd.exe /C "`"$ActionPath`""
}
