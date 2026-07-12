@echo off
REM Start VOA API (detached) + launcher
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0services\api\start-api.ps1"
set VOA_API_URL=http://127.0.0.1:3100
call npm run dev:launcher
