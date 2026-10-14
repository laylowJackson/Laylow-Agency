@echo off
setlocal
cd /d "%~dp0"
title Laylow Agency - Local App
echo Laylow Agency will run on this Windows computer.
echo Keep this window open while using the app.
echo.
if not exist ".venv\Scripts\python.exe" (
    call "%~dp0SETUP_WINDOWS.bat"
    if errorlevel 1 exit /b 1
)
echo After the dashboard says Running, open:
echo http://127.0.0.1:5000/#settings
echo.
call "%~dp0START_WINDOWS.bat"
exit /b %errorlevel%
