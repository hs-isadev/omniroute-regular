@echo off
REM Launches the shared browser consumer session in the background.
REM All 6 providers (Claude, Z.AI, Kimi, Perplexity, Qwen, DeepSeek) run in one browser.
REM Auto-detects the user's default Chromium browser (Chrome/Edge/Opera/Brave/Vivaldi).

setlocal EnableDelayedExpansion

set "ADAPTER_DIR=%~dp0.."
set "PROFILE_DIR=%USERPROFILE%\.omniroute-browser-consumers\browser-profile"
set "PORT=47842"

echo.
echo ============================================
echo  OmniRoute Browser Consumer Adapter
echo ============================================
echo.
echo Starting shared browser session on port %PORT% ...
echo Profile: %PROFILE_DIR%
echo.

REM Launch shared-session.mjs in background
start /B node "%ADAPTER_DIR%\src\shared-session.mjs" --background --port %PORT% --profile "%PROFILE_DIR%"

echo.
echo Session started. Sign in to any unfinished provider tabs.
echo The window will minimize automatically once all 6 providers are ready.
echo.
pause