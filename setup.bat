@echo off
setlocal

rem Terrene local setup. Run this once from any Command Prompt.
set "ROOT=%~dp0"
pushd "%ROOT%"

echo [Terrene] Checking required tools...
where node >nul 2>&1
if errorlevel 1 (
  echo [Terrene] Node.js was not found. Install Node.js 20.19+ and run setup again.
  set "SETUP_ERROR=1"
  goto :finish
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [Terrene] npm was not found. Reinstall Node.js with npm enabled and run setup again.
  set "SETUP_ERROR=1"
  goto :finish
)

set "PYTHON="
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -c "import sys" >nul 2>&1
  if not errorlevel 1 set "PYTHON=py -3"
)
if not defined PYTHON (
  where python >nul 2>&1
  if not errorlevel 1 set "PYTHON=python"
)
if not defined PYTHON (
  echo [Terrene] Python 3 was not found. Install Python 3.11+ and run setup again.
  set "SETUP_ERROR=1"
  goto :finish
)

echo [Terrene] Installing frontend dependencies with npm ci...
call npm ci
if errorlevel 1 (
  echo [Terrene] npm ci failed.
  set "SETUP_ERROR=1"
  goto :finish
)

if not exist ".venv\Scripts\python.exe" (
  echo [Terrene] Creating the Python virtual environment...
  %PYTHON% -m venv .venv
  if errorlevel 1 (
    echo [Terrene] Could not create .venv.
    set "SETUP_ERROR=1"
    goto :finish
  )
)

echo [Terrene] Installing backend dependencies...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 (
  echo [Terrene] Could not update pip.
  set "SETUP_ERROR=1"
  goto :finish
)
".venv\Scripts\python.exe" -m pip install -r backend\requirements-dev.txt
if errorlevel 1 (
  echo [Terrene] Backend dependency installation failed.
  set "SETUP_ERROR=1"
  goto :finish
)

if not exist ".env" (
  echo [Terrene] Creating .env from .env.example. Add provider keys only if you have them.
  copy /Y ".env.example" ".env" >nul
)

echo [Terrene] Applying database migrations...
".venv\Scripts\python.exe" -m alembic upgrade head
if errorlevel 1 (
  echo [Terrene] Database migration failed.
  set "SETUP_ERROR=1"
  goto :finish
)

echo.
echo [Terrene] Setup complete.
echo [Terrene] Run start.bat to launch the API and frontend locally.

:finish
popd
if defined SETUP_ERROR exit /b 1
exit /b 0
