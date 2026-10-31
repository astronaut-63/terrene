@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem Terrene local setup. Run this once from any Command Prompt.
set "ROOT=%~dp0"
cd /d "%ROOT%"

if not exist "%ROOT%package.json" (
  echo [Terrene] Run this file from the Terrene repository folder.
  set "SETUP_ERROR=1"
  goto :finish
)

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
  py -3 -c "import sys; sys.exit(sys.version_info < (3,11))" >nul 2>&1
  if not errorlevel 1 set "PYTHON=py -3"
)
if not defined PYTHON (
  where python >nul 2>&1
  if not errorlevel 1 (
    python -c "import sys; sys.exit(sys.version_info < (3,11))" >nul 2>&1
    if not errorlevel 1 set "PYTHON=python"
  )
)
if not defined PYTHON (
  echo [Terrene] Python 3.11 or newer was not found. Install Python and run setup again.
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
  %PYTHON% -m venv "%ROOT%.venv"
  if errorlevel 1 (
    echo [Terrene] Could not create .venv.
    set "SETUP_ERROR=1"
    goto :finish
  )
)

echo [Terrene] Installing backend dependencies...
"%ROOT%.venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 (
  echo [Terrene] Could not update pip.
  set "SETUP_ERROR=1"
  goto :finish
)
"%ROOT%.venv\Scripts\python.exe" -m pip install -r "%ROOT%backend\requirements-dev.txt"
if errorlevel 1 (
  echo [Terrene] Backend dependency installation failed.
  set "SETUP_ERROR=1"
  goto :finish
)

if not exist ".env" (
  echo [Terrene] Creating .env from .env.example. Add provider keys only if you have them.
  copy /Y ".env.example" ".env" >nul
  if errorlevel 1 (
    echo [Terrene] Could not create .env.
    set "SETUP_ERROR=1"
    goto :finish
  )
)

echo [Terrene] Applying database migrations...
"%ROOT%.venv\Scripts\python.exe" -m alembic upgrade head
if errorlevel 1 (
  echo [Terrene] Database migration failed.
  set "SETUP_ERROR=1"
  goto :finish
)

echo.
echo [Terrene] Setup complete.
echo [Terrene] Run start.bat to launch the API and frontend locally.

:finish
if defined SETUP_ERROR (
  echo.
  echo [Terrene] Setup failed. Read the message above and fix the reported issue.
  pause
  exit /b 1
)
exit /b 0
