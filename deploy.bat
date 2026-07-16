@echo off
title Horror Game - Deploying...
echo ===================================
echo   HORROR GAME SERVER
echo ===================================
echo.
echo Starting server on http://localhost:8000
echo Press Ctrl+C to stop.
echo.
cd /d "%~dp0"
node server.js
pause
