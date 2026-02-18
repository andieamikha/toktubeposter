@echo off
title TikTok Manager - Starting...
chcp 65001 >nul 2>&1

:: Get the directory where this script lives
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

:: Set Node.js path (portable)
set "NODE_DIR=%ROOT%\node20\node-v20.19.2-win-x64"
set "PATH=%NODE_DIR%;%PATH%"

echo ============================================
echo   TikTok Manager - Portable Launcher
echo ============================================
echo.
echo  Root    : %ROOT%
echo  Node.js : 

:: Verify node exists
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found in %NODE_DIR%
    echo Please make sure node20 folder exists.
    pause
    exit /b 1
)

node --version
echo.

:: Check if node_modules exist
if not exist "%ROOT%\backend\node_modules" (
    echo [WARN] backend/node_modules not found!
    echo Running first-time install...
    echo.
    cd /d "%ROOT%\backend"
    call npm install
    echo.
)

if not exist "%ROOT%\frontend\node_modules" (
    echo [WARN] frontend/node_modules not found!
    echo Running first-time install...
    echo.
    cd /d "%ROOT%\frontend"
    call npm install
    echo.
)

:: Ensure backend/.env exists
if not exist "%ROOT%\backend\.env" (
    if exist "%ROOT%\.env" (
        echo [INFO] Copying root .env to backend/.env
        copy "%ROOT%\.env" "%ROOT%\backend\.env" >nul
    ) else if exist "%ROOT%\backend\.env.example" (
        echo [INFO] Creating backend/.env from .env.example
        copy "%ROOT%\backend\.env.example" "%ROOT%\backend\.env" >nul
        echo [INFO] backend/.env created. Edit it later to add API keys.
    ) else (
        echo [WARN] No .env or .env.example found! Backend may not start correctly.
    )
)

:: Ensure backend/data directory exists
if not exist "%ROOT%\backend\data" (
    mkdir "%ROOT%\backend\data"
)

echo [1/2] Starting Backend (port 3001)...
cd /d "%ROOT%\backend"
start "TikTok Manager - Backend" cmd /c "title TikTok Manager - Backend & set PATH=%NODE_DIR%;%PATH% & cd /d %ROOT%\backend & npx nest start"

:: Wait for backend to be ready
echo       Waiting for backend...
timeout /t 5 /nobreak >nul

echo [2/2] Starting Frontend (port 3000)...
cd /d "%ROOT%\frontend"
start "TikTok Manager - Frontend" cmd /c "title TikTok Manager - Frontend & set PATH=%NODE_DIR%;%PATH% & cd /d %ROOT%\frontend & npx next dev"

timeout /t 3 /nobreak >nul

echo.
echo ============================================
echo   TikTok Manager is running!
echo.
echo   Frontend : http://localhost:3000
echo   Backend  : http://localhost:3001/api/v1
echo.
echo   Close the Backend/Frontend windows to stop.
echo ============================================
echo.
pause
