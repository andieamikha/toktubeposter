@echo off
title TikTok Manager - Stopping...
chcp 65001 >nul 2>&1

echo ============================================
echo   TikTok Manager - Stopping all services
echo ============================================
echo.

:: Kill node processes on specific ports
echo Stopping Backend (port 3001)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Stopping Frontend (port 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo All services stopped.
timeout /t 2 /nobreak >nul
