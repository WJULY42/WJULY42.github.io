@echo off
cd /d "%~dp0"
where node >nul 2>nul || (
  echo ============================================
  echo   Node.js not found!
  echo   Please install Node.js LTS from https://nodejs.org
  echo   then double-click this file again.
  echo ============================================
  pause
  exit /b 1
)
echo Starting LAN server, opening game in browser...
start "" "http://localhost:9000"
node server.js
