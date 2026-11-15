@echo off
start "" /b python python-forecast\app.py
timeout /t 2 >nul
node dist\gateway\server.js
