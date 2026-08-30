@echo off
"%~dp0node\node.exe" "%~dp0app\distribution\launch.mjs"
if errorlevel 1 pause
