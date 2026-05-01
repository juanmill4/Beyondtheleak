@echo off
echo ==========================================
echo OSINT Backend Environment Setup
echo ==========================================

echo [1/3] Creating Python Virtual Environment (venv)...
python -m venv venv

echo [2/3] Activating venv...
call venv\Scripts\activate.bat

echo [3/3] Installing dependencies from requirements.txt...
pip install -r requirements.txt

echo ==========================================
echo Setup Complete!
echo You can now use run_backend.bat to start the services.
echo ==========================================
pause
