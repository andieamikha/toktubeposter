@echo off
title TikTok Manager - First Time Setup
chcp 65001 >nul 2>&1

:: Get the directory where this script lives
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

:: Set Node.js path (portable)
set "NODE_DIR=%ROOT%\node20\node-v20.19.2-win-x64"
set "PATH=%NODE_DIR%;%PATH%"

echo ============================================
echo   TikTok Manager - First Time Setup
echo ============================================
echo.

:: Verify node exists
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found in %NODE_DIR%
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

:: Install backend dependencies
echo [1/2] Installing backend dependencies...
cd /d "%ROOT%\backend"
call npm install
echo.

:: Install frontend dependencies
echo [2/2] Installing frontend dependencies...
cd /d "%ROOT%\frontend"
call npm install
echo.

echo ============================================
echo   Setup complete!
echo   Run start.bat to launch the application.
echo ============================================
echo.
pause
