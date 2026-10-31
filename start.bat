@echo off
setlocal

rem Terrene local development launcher.
set "ROOT=%~dp0"
pushd "%ROOT%"

if not exist ".venv\Scripts\python.exe" (
  echo [Terrene] Python environment is missing. Running setup first...
  call "%ROOT%setup.bat"
  if errorlevel 1 (
    popd
    exit /b 1
  )
)
if not exist "node_modules" (
  echo [Terrene] Node dependencies are missing. Running setup first...
  call "%ROOT%setup.bat"
  if errorlevel 1 (
    popd
    exit /b 1
  )
)

".venv\Scripts\python.exe" scripts\local_preflight.py
if errorlevel 1 (
  popd
  exit /b 1
)

echo [Terrene] Applying database migrations...
".venv\Scripts\python.exe" -m alembic upgrade head
if errorlevel 1 (
  echo [Terrene] Migration failed. Servers were not started.
  popd
  exit /b 1
)

echo [Terrene] Restart both server windows after changing .env.
echo [Terrene] Starting FastAPI at http://localhost:3002 ...
start "Terrene API" /D "%ROOT%" "%ComSpec%" /k ".venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 3002"

echo [Terrene] Starting Vite at http://localhost:5173 ...
start "Terrene Frontend" /D "%ROOT%" "%ComSpec%" /k "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"

echo.
echo [Terrene] API:      http://localhost:3002/docs
echo [Terrene] Frontend: http://localhost:5173
echo [Terrene] Close the two Terrene windows to stop local development.

popd
exit /b 0
