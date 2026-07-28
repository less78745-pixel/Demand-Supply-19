@echo off
echo ==========================================
echo Starting Demand and Supply Analytics App
echo ==========================================

echo Starting Backend Server...
cd backend
start "Backend API" cmd /k "call venv\Scripts\activate && uvicorn main:app --reload --port 8000"

echo Starting Frontend Server...
cd ../frontend
echo Membersihkan cache frontend...
if exist .next rmdir /s /q .next
start "Frontend App" cmd /k "npm run dev"

echo Starting Localtunnel for Vercel...
start "Localtunnel" cmd /k "npx localtunnel --port 8000 --subdomain dsp-backend-afif-19"

echo Both servers and tunnel are starting in separate windows!
echo Backend will be running at http://localhost:8000
echo Frontend will be running at http://localhost:3000
