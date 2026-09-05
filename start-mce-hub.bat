@echo off
title MCE PYQ Hub - Production Watchdog & Server
color 0b
cd /d "%~dp0"
.\venv\Scripts\python.exe run_hub.py
pause
