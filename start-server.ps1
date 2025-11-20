# PowerShell script to start local web server using npx
Write-Host "Starting Blob Evolution Simulation Server..." -ForegroundColor Green
Write-Host ""
Write-Host "Server will be available at: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Check if Node.js is installed
try {
    $null = Get-Command node -ErrorAction Stop
} catch {
    Write-Host ""
    Write-Host "ERROR: Node.js not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Start http-server using npx
npx --yes http-server -p 8000 -c-1

