@echo off
echo ===================================================
echo   Menjalankan Backend (FastAPI) dan Frontend (Next.js)
echo ===================================================

echo [1/2] Menjalankan Backend (Port 8000)...
cd backend
start cmd /k "python -m venv venv & call venv\Scripts\activate & pip install -r requirements.txt & uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Menjalankan Frontend (Port 3000)...
cd ..\frontend
start cmd /k "npm install & npm run dev"

echo.
echo ===================================================
echo Backend berjalan di jendela baru (localhost:8000)
echo Frontend berjalan di jendela baru (localhost:3000)
echo ===================================================
echo Anda bisa menutup jendela ini.
pause
