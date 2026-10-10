@echo off
setlocal
cd /d "%~dp0"
if exist "release\win-unpacked\Irminsul-Teyvat.exe" (
  start "" "release\win-unpacked\Irminsul-Teyvat.exe"
  exit /b 0
)
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 24 or newer is required for source startup.
  echo Use the packaged application in release\win-unpacked instead.
  pause
  exit /b 1
)
if not exist "node_modules\electron\package.json" (
  call npm ci
  if errorlevel 1 goto failed
)
set "ELECTRON_CACHE=%CD%\.cache\electron"
set "electron_config_cache=%CD%\.cache\electron"
if defined HTTPS_PROXY set "ELECTRON_GET_USE_PROXY=1"
if defined HTTPS_PROXY set "NODE_USE_ENV_PROXY=1"
if not exist "node_modules\electron\dist\electron.exe" (
  call node node_modules\electron\install.js
  if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
start "" "node_modules\electron\dist\electron.exe" "."
exit /b 0
:failed
echo Startup failed. See the message above and README.md.
pause
exit /b 1
