@echo off
title Reset Admin Password
chcp 65001 >nul 2>&1

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "NODE_DIR=%ROOT%\node20\node-v20.19.2-win-x64"
set "PATH=%NODE_DIR%;%PATH%"

echo ============================================
echo   Reset Admin Password
echo ============================================
echo.
echo This will reset the admin account to:
echo   Email    : admin@tiktokmanager.com
echo   Password : Admin123!
echo.

node "%ROOT%\reset-admin.js"

echo.
pause

