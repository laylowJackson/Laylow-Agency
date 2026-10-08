@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Run SETUP_WINDOWS.bat first.
    pause
    exit /b 1
)
".venv\Scripts\python.exe" check_setup.py
if errorlevel 1 (
    pause
    exit /b 1
)
".venv\Scripts\python.exe" run_all.py
set "laylowExit=%errorlevel%"
pause
exit /b %laylowExit%
