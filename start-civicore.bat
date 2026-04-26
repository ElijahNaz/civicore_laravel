@echo off
title CiviCORE Control Center
echo ===================================================
echo   CiviCORE: Starting All Systems (V3)...
echo ===================================================

:: 1. Start PHP Laravel Server
echo [1/4] Launching Laravel Server on http://localhost:8000...
start "Laravel Server" cmd /k "php artisan serve"

:: 2. Start Laravel Queue Workers (Parallel Processing)
echo [2/4] Launching 2x Background Queue Workers (high, low, default)...
start "Queue Worker 1" cmd /k "php artisan queue:work --queue=high,low,default --tries=3"
start "Queue Worker 2" cmd /k "php artisan queue:work --queue=high,low,default --tries=3"

:: 3. Start Persistent OCR Server
echo [3/4] Launching Persistent OCR Server (FastAPI + Dynamic Scaling)...
start "OCR Server" cmd /k "python ocr_server.py"

:: 4. Start Vite (Frontend)
echo [4/4] Launching Vite Frontend (npm run dev)...
start "Vite Dev" cmd /k "npm run dev"

echo ===================================================
echo   ALL SYSTEMS GO! 
echo   1. Wait for "OCR Reader ready" in the OCR window.
echo   2. Wait for "VITE ready" in the Vite window.
echo   3. Then visit: http://localhost:8000
echo ===================================================
pause
