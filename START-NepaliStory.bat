@echo off
setlocal
cd /d "%~dp0"
title NepaliStory.com - Development

echo ========================================
echo       NepaliStory.com Development
echo ========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not on PATH.
  echo Install Node.js LTS, then reopen this file.
  pause
  exit /b 1
)
if not exist "server\.env" (
  copy ".env.example" "server\.env" >nul
  echo Created server\.env from the example.
  echo IMPORTANT: Edit server\.env and set your real PostgreSQL password.
  echo Then run this file again.
  notepad "server\.env"
  pause
  exit /b 0
)
if not exist "node_modules" (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 goto failed
)
echo Generating Prisma client...
call npm run db:generate
if errorlevel 1 goto failed
echo Applying database migrations...
call npm run db:deploy
if errorlevel 1 goto failed
echo.
echo Starting API and frontend. Keep this window open.
echo Frontend: http://localhost:5173
echo API health: http://localhost:4000/api/health
echo.
call npm run dev
if errorlevel 1 goto failed
goto end
:failed
echo.
echo A command failed. Read the error above, fix it, and try again.
pause
:end
endlocal
