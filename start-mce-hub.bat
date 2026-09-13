@echo off
title MCE PYQ Hub - Production Server & Mobile Tunnel
color 0b
cd /d "%~dp0"

echo =======================================================
echo          STARTING MCE PYQ HUB SERVER & APP
echo =======================================================
echo.

if exist "venv\Scripts\python.exe" (
    venv\Scripts\python.exe run_hub.py
) else (
    python run_hub.py
)

pause
