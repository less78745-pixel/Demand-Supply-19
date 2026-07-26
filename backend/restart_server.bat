@echo off
echo ============================================
echo  WMS Backend - Kill Old + Start Fresh
echo ============================================
echo.

echo [1/3] Killing any process on port 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo      Killing PID %%a
    taskkill /F /PID %%a 2>nul
)
timeout /t 2 /nobreak >nul

echo [2/3] Activating virtual environment...
call venv\Scripts\activate.bat

echo [3/3] Starting backend server with --reload...
echo      Backend will be available at http://127.0.0.1:8000
echo      Press Ctrl+C to stop
echo.
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
