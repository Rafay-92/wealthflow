@echo off
rem ------------------------------------------------------------------
rem  Double-click this file to open WealthFlow in your web browser.
rem  Keep the black window open while you use the app.
rem  Close the black window when you're done (that stops the app).
rem
rem  It runs a finished, pre-built copy of the app (not the developer
rem  version), which is faster and isn't disturbed by code changes.
rem ------------------------------------------------------------------
title WealthFlow
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js isn't installed or can't be found.
  echo Install it from https://nodejs.org, then double-click this file again.
  pause
  exit /b 1
)

rem Already running? Then just open it in the browser.
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo WealthFlow is already running. Opening it in your browser...
  start "" http://localhost:5173
  timeout /t 3 >nul
  exit /b 0
)

if not exist node_modules (
  echo First time: installing what WealthFlow needs. This takes a minute...
  call npm install
)

echo.
echo  Preparing WealthFlow (a few seconds)...
call npx vite build --logLevel error
if errorlevel 1 (
  echo.
  echo  WealthFlow couldn't be prepared. The message above explains why.
  pause
  exit /b 1
)

echo.
echo  WealthFlow is running at http://localhost:5173
echo  Your browser will open now. Keep this window open while you use the app.
echo  Close this window to stop WealthFlow.
echo.
call npx vite preview --port 5173 --strictPort --open
