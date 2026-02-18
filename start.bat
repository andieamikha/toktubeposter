@echo off
title TikTok Manager - Starting...
chcp 65001 >nul 2>&1

:: Get the directory where this script lives
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

:: Set Node.js path (portable if available, otherwise use system node)
if exist "%ROOT%\node20\node-v20.19.2-win-x64\node.exe" (
    set "NODE_DIR=%ROOT%\node20\node-v20.19.2-win-x64"
    set "PATH=%ROOT%\node20\node-v20.19.2-win-x64;%PATH%"
)

echo ============================================
echo   TikTok Manager - Portable Launcher
echo ============================================
echo.
echo  Root    : %ROOT%
echo  Node.js : 

:: Verify node exists
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found!
    echo Please install Node.js 20+ from https://nodejs.org/
    echo Or place portable Node.js in node20\ folder.
    pause
    exit /b 1
)

node --version
echo.

:: Skip puppeteer chromium download (optional feature, saves 150MB+ download)
set "PUPPETEER_SKIP_DOWNLOAD=true"
set "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true"

:: Check if node_modules exist
if not exist "%ROOT%\backend\node_modules" (
    echo [INFO] backend/node_modules not found - running first-time install...
    echo        This may take a few minutes...
    echo.
    cd /d "%ROOT%\backend"
    call npm install --ignore-scripts 2>&1
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install backend dependencies!
        pause
        exit /b 1
    )
    echo.
    echo [OK] Backend dependencies installed.
    echo.
)

if not exist "%ROOT%\frontend\node_modules" (
    echo [INFO] frontend/node_modules not found - running first-time install...
    echo        This may take a few minutes...
    echo.
    cd /d "%ROOT%\frontend"
    call npm install 2>&1
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install frontend dependencies!
        pause
        exit /b 1
    )
    echo.
    echo [OK] Frontend dependencies installed.
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
echo       (window will stay open if there's an error)
cd /d "%ROOT%\backend"
start "TikTok Manager - Backend" cmd /k "title TikTok Manager - Backend & set PUPPETEER_SKIP_DOWNLOAD=true & set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true & set PATH=%ROOT%\node20\node-v20.19.2-win-x64;%PATH% & cd /d %ROOT%\backend & echo Starting NestJS backend... & npx nest start & echo. & echo [BACKEND STOPPED] Press any key to close. & pause >nul"

:: Wait for backend to actually respond
echo       Waiting for backend to be ready...
set /a ATTEMPTS=0
:wait_backend
set /a ATTEMPTS+=1
if %ATTEMPTS% gtr 60 (
    echo.
    echo [WARN] Backend did not respond after 60 seconds.
    echo        Check the Backend window for errors.
    echo        Starting frontend anyway...
    goto start_frontend
)
timeout /t 2 /nobreak >nul
node -e "const http=require('http');http.get('http://localhost:3001/api/v1',r=>{process.exit(0)}).on('error',()=>{process.exit(1)})" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    <nul set /p "=."
    goto wait_backend
)
echo.
echo       [OK] Backend is ready!

:start_frontend
echo.
echo [2/2] Starting Frontend (port 3000)...
cd /d "%ROOT%\frontend"
start "TikTok Manager - Frontend" cmd /k "title TikTok Manager - Frontend & set PATH=%ROOT%\node20\node-v20.19.2-win-x64;%PATH% & cd /d %ROOT%\frontend & echo Starting Next.js frontend... & npx next dev & echo. & echo [FRONTEND STOPPED] Press any key to close. & pause >nul"

timeout /t 5 /nobreak >nul

echo.
echo ============================================
echo   TikTok Manager is running!
echo.
echo   Frontend : http://localhost:3000
echo   Backend  : http://localhost:3001/api/v1
echo.
echo   Login: admin@tiktokmanager.com / Admin123!
echo.
echo   Close the Backend/Frontend windows to stop.
echo ============================================
echo.
pause
