@echo off
title Attendance Tracker
cd /d "%~dp0"
echo Starting Attendance Tracker...
echo Your browser will open at https://localhost:3000
echo Close this window to stop the server.
echo.
node server.js
pause