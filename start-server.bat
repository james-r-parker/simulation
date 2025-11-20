@echo off
echo Starting Blob Evolution Simulation Server...
echo.
echo Server will be available at: http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Node.js not found!
    echo.
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Start http-server using npx
npx --yes http-server -p 8000 -c-1

