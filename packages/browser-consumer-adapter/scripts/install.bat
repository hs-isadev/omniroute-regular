@echo off
REM ==================================================================
REM OmniRoute Browser Consumer Adapter - 1-Click Setup
REM ==================================================================
REM This script:
REM   1. Detects your default Chromium-family browser (Chrome/Edge/Opera/Brave)
REM   2. Starts the shared browser session on port 47842
REM   3. Registers a Windows Task Scheduler entry for autostart on boot
REM ==================================================================

setlocal EnableDelayedExpansion

set "ADAPTER_DIR=%~dp0.."
set "PROFILE_DIR=%USERPROFILE%\.omniroute-browser-consumers\browser-profile"
set "PORT=47842"

echo.
echo ============================================
echo  OmniRoute - 1-Click Browser Consumer Setup
echo ============================================
echo.

REM --- Step 1: Detect the user's default browser ---
set "BROWSER_PATH="
echo Detecting your default browser...

REM Check for Chrome
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
    echo [OK] Using Google Chrome
    goto :browser_found
)
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
    echo [OK] Using Google Chrome
    goto :browser_found
)

REM Check for Edge
if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_PATH=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
    echo [OK] Using Microsoft Edge
    goto :browser_found
)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    echo [OK] Using Microsoft Edge
    goto :browser_found
)

REM Check for Opera
if exist "%LOCALAPPDATA%\Programs\Opera GX/opera.exe" (
    set "BROWSER_PATH=%LOCALAPPDATA%\Programs\Opera GX/opera.exe"
    echo [OK] Using Opera GX
    goto :browser_found
)
if exist "%LOCALAPPDATA%\Programs\Opera/opera.exe" (
    set "BROWSER_PATH=%LOCALAPPDATA%\Programs\Opera/opera.exe"
    echo [OK] Using Opera
    goto :browser_found
)

REM Check for Brave
if exist "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe" (
    set "BROWSER_PATH=%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"
    echo [OK] Using Brave
    goto :browser_found
)
if exist "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" (
    set "BROWSER_PATH=C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
    echo [OK] Using Brave
    goto :browser_found
)

REM Check for Vivaldi
if exist "%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe" (
    set "BROWSER_PATH=%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe"
    echo [OK] Using Vivaldi
    goto :browser_found
)
if exist "C:\Program Files\Vivaldi\Application\vivaldi.exe" (
    set "BROWSER_PATH=C:\Program Files\Vivaldi\Application\vivaldi.exe"
    echo [OK] Using Vivaldi
    goto :browser_found
)

echo.
echo [WARNING] No Chromium-family browser found.
echo Please use Chrome, Edge, Opera, Brave, or Vivaldi.
echo Or set OMNIROUTE_BROWSER environment variable to your browser path.
echo.
pause
exit /b 1

:browser_found
echo.
echo Your browser: !BROWSER_PATH!
echo.

REM --- Step 2: Initialize Playwright (if not installed) ---
echo Checking Playwright installation...
cd /d "%ADAPTER_DIR%"
if not exist node_modules\playwright (
    echo Installing Playwright...
    npm install --no-save playwright@1.62.1
    echo Downloading Chromium for Playwright...
    npx playwright install chromium
)
echo [OK] Playwright ready
echo.

REM --- Step 3: Start the shared browser session ---
echo Starting shared browser session on port %PORT% ...
echo Profile directory: %PROFILE_DIR%
echo.

REM Kill any existing session on this port
powershell -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort %PORT% -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"

start /B node "%ADAPTER_DIR%\src\shared-session.mjs" --background --port %PORT% --profile "%PROFILE_DIR%" --browser "!BROWSER_PATH!"
timeout /t 3 /nobreak >nul
echo [OK] Shared browser session launched
echo.

REM --- Step 4: Register Task Scheduler entry for autostart ---
echo Registering autostart task in Windows Task Scheduler...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ADAPTER_DIR%\scripts\setup-autostart.ps1" -AdapterDir "%ADAPTER_DIR%"
echo [OK] Autostart registered
echo.

echo ============================================
echo  Setup Complete!
echo ============================================
echo.
echo The browser consumer session auto-starts when you sign in to Windows.
echo All 6 providers run in one background browser instance:
echo   Claude ^| Z.AI ^| Kimi ^| Perplexity ^| Qwen ^| DeepSeek
echo.
echo Next: Sign in to each provider in the browser that is now opening.
echo       Once all 6 show green, you're ready to use OmniRoute.
echo.
pause