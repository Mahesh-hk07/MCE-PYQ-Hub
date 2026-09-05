@echo off
title MCE PYQ Hub - Server & Mobile Tunnel
color 0b
echo =======================================================
echo          STARTING MCE PYQ HUB SERVER & APP
echo =======================================================
echo.
echo Cleaning up any old server processes on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do (
    taskkill /f /pid %%a >nul 2>&1
)
taskkill /f /im cloudflared.exe >nul 2>&1

echo Starting Python Backend Server on Port 8000...
start "MCE PYQ Hub Server" /min cmd /c ".\\venv\\Scripts\\python.exe -u server.py"

timeout /t 3 >nul

echo Starting Cloudflare Tunnel for Mobile / Public Access...
.\cloudflared.exe tunnel --url http://127.0.0.1:8000
