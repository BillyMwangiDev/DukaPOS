@echo off
setlocal
echo ==========================================
echo    DukaPOS Local Setup & Bootstrapper
echo ==========================================

:: 1. Backend Setup
echo [1/4] Setting up Backend Python environment...
cd backend
if not exist .venv (
    python -m venv .venv
)
call .venv\Scripts\activate
pip install -r requirements.txt
cd ..

:: 2. Frontend Setup (Renderer)
echo [2/4] Installing Renderer dependencies...
cd electron\src\renderer
npm install --verbose
cd ..\..\..

:: 3. Electron Setup (Main)
echo [3/4] Installing Electron dependencies...
cd electron
npm install --verbose
cd ..

:: 4. Database Initialization
echo [4/4] Initializing Database...
cd backend
call .venv\Scripts\activate
:: Run a small python script to create tables
python -c "from app.database import create_db_and_tables; create_db_and_tables(); print('Database initialized successfully.')"
cd ..

echo.
echo ==========================================
echo    Setup Complete! 
echo    Run 'cd electron && npm run dev' to start.
echo ==========================================
pause
