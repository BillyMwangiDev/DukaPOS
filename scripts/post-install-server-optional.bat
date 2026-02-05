@echo off
setlocal EnableDelayedExpansion
REM ============================================================
REM DukaPOS: Run AFTER installing on the PC that will be the SERVER.
REM Use only when you have 2 or more PCs (multi-terminal).
REM Asks: "Will other PCs connect to this one?" Y = allow firewall.
REM Run as Administrator for firewall change to work.
REM
REM Optional: pass Y or SERVER as first argument to skip prompt
REM and add firewall (for scripting). Use --silent to avoid pause.
REM ============================================================

set "CHOICE="
set "SILENT=0"
if /i "%~1"=="--silent" set "SILENT=1"
if /i "%~1"=="-s" set "SILENT=1"

if /i "%~1"=="Y" set "CHOICE=Y"
if /i "%~1"=="SERVER" set "CHOICE=Y"
if /i "%~1"=="N" set "CHOICE=N"
if /i "%~1"=="CLIENT" set "CHOICE=N"

if not defined CHOICE (
    echo.
    echo DukaPOS - Server setup ^(multi-PC^)
    echo ============================================================
    echo.
    echo Will OTHER PCs connect to THIS PC to run DukaPOS?
    echo   - One PC only           -^> Press N
    echo   - This PC is the server -^> Press Y ^(then we allow firewall^)
    echo.
    set /p CHOICE="Enter Y or N: "
)

if /i "!CHOICE!"=="Y" (
    echo.
    echo Opening firewall script. If a UAC prompt appears, click Yes.
    if %SILENT% equ 1 (
        set "DUKAPOS_SILENT=1"
        call "%~dp0firewall-allow-backend.bat" --silent
    ) else (
        call "%~dp0firewall-allow-backend.bat"
    )
    if !errorLevel! equ 0 (
        echo.
        echo Next: Run "get-server-ip.bat" on this PC to see the address
        echo       that client PCs must enter in DukaPOS Settings.
    )
) else (
    echo.
    echo No firewall change. Use this PC as a single till only.
    echo If you later add more PCs and make this the server,
    echo run "firewall-allow-backend.bat" as Administrator.
)

if %SILENT% equ 0 (
    echo.
    pause
)

endlocal
exit /b 0
