@echo off
echo ============================================
echo  WMS Backend - Safe Restart
echo ============================================
echo.

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Starting safe server script...
python start_server.py
