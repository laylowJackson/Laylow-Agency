@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP_WINDOWS.ps1"
set "laylowExit=%errorlevel%"
pause
exit /b %laylowExit%
