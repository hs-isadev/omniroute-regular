@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Download-OmniRoute-Regular.ps1"
if errorlevel 1 pause
