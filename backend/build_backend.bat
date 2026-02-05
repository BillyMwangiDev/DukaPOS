@echo off
echo Installing PyInstaller...
.venv\Scripts\python.exe -m pip install pyinstaller
if %errorlevel% neq 0 (
    echo Failed to install PyInstaller
    exit /b %errorlevel%
)

echo Building Backend...
.venv\Scripts\python.exe -m PyInstaller dukapos_server.spec --clean --noconfirm
if %errorlevel% neq 0 (
    echo PyInstaller build failed
    exit /b %errorlevel%
)

echo Build Complete!
if exist "dist\server.exe" (
    echo server.exe created successfully wih size:
    dir dist\server.exe
) else (
    echo server.exe NOT FOUND
)
