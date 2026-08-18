@echo off
echo ========================================================
echo Starting WMS Analytics App (Local Development)
echo ========================================================

echo.
echo [1/3] Checking Backend Python Environment...
cd frontend\api

if not exist venv\ (
    echo Creating virtual environment...
    python -m venv venv
)

echo Activating venv and installing requirements...
call venv\Scripts\activate.bat
pip install -r requirements.txt

echo Initializing user accounts (standard users + Super Admin RLS)...
python scripts\init_users.py

echo Starting FastAPI Backend...
start "WMS Backend (FastAPI)" cmd /c "call venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"

echo.
echo [2/3] Checking Frontend Environment...
cd ..
if not exist node_modules\ (
    echo Installing npm dependencies...
    call npm install
)

echo Starting Next.js Frontend...
start "WMS Frontend (Next.js)" cmd /c "npm run dev"

echo.
echo ========================================================
echo [3/3] ALL SYSTEMS GO!
echo.
echo Backend is running on: http://localhost:8000
echo Frontend is running on: http://localhost:3000
echo.
echo You can now access the web application at http://localhost:3000
echo (Note: Localtunnel is no longer needed since frontend and backend are merged!)
echo ========================================================
pause
