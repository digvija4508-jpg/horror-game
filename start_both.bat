@echo off
title Horror Game - Both Servers
cd /d "D:\horror game"
start "Main Game" cmd /c "node server.js"
start "View System" cmd /c "node view_server.js"
echo.
echo Both servers started:
echo   Main game:   http://localhost:8000
echo   View system: http://localhost:8001
echo.
pause
