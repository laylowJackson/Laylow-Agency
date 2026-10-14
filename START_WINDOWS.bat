@echo off
setlocal
cd /d "%~dp0"
title Laylow Agency - Local App
echo Checking Laylow Agency Python setup...
echo.

if not exist "requirements.txt" (
    echo ERROR: requirements.txt is missing. Extract the full Laylow Agency ZIP before starting.
    pause
    exit /b 1
)
if not exist ".venv\Scripts\python.exe" goto :repair

".venv\Scripts\python.exe" check_setup.py
if not errorlevel 1 goto :launch

:repair
echo.
echo Missing or incomplete Python packages detected.
echo Running the Laylow Agency setup automatically. Internet required.
echo.
call "%~dp0SETUP_WINDOWS.bat"
if errorlevel 1 (
    echo.
    echo Automatic setup failed. Check the error above and your Python installation.
    pause
    exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
    echo ERROR: The Python environment was not created.
    pause
    exit /b 1
)
".venv\Scripts\python.exe" check_setup.py
if errorlevel 1 (
    echo ERROR: Packages are still missing after setup.
    pause
    exit /b 1
)

:launch
echo.
echo Setup passed. Starting your local dashboard...
echo Open http://127.0.0.1:5000 on this PC.
echo.
".venv\Scripts\python.exe" run_all.py
set "laylowExit=%errorlevel%"
pause
exit /b %laylowExit%
