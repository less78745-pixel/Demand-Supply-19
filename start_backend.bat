@echo off
REM Wrapper script to run the PowerShell backend start script
echo Starting backend and tunnel...
powershell -ExecutionPolicy Bypass -File "%~dp0start_backend.ps1"
pause
