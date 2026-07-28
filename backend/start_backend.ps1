# This script forwards the execution to the root start_backend.ps1 script
Write-Host "Forwarding to root start_backend.ps1..." -ForegroundColor DarkGray
& "$PSScriptRoot\..\start_backend.ps1"
