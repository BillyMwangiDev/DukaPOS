@echo off
setlocal
REM ============================================================
REM DukaPOS: Remove the firewall rule for the backend port.
REM Use when uninstalling the server or to block LAN clients.
REM Run as Administrator: right-click -> Run as administrator.
REM
REM Optional: run with --silent or -s (or set DUKAPOS_SILENT=1)
REM to skip pause and interactive messages (for installer use).
REM ============================================================

set "RULE_NAME=DukaPOS Backend"
set "SILENT=0"
if /i "%~1"=="--silent" set "SILENT=1"
if /i "%~1"=="-s" set "SILENT=1"
if defined DUKAPOS_SILENT set "SILENT=1"

net session >nul 2>&1
if %errorLevel% neq 0 (
    if %SILENT% equ 0 (
        echo This script must be run as Administrator.
        echo Right-click the file and choose "Run as administrator".
        pause
    )
    exit /b 1
)

netsh advfirewall firewall delete rule name="%RULE_NAME%"
set "DEL_ERR=%errorLevel%"

if %DEL_ERR% equ 0 (
    if %SILENT% equ 0 (
        echo.
        echo [OK] Firewall rule "%RULE_NAME%" removed.
        echo.
        pause
    )
) else (
    if %SILENT% equ 0 (
        echo.
        echo Rule may not exist or already removed.
        echo.
        pause
    )
)

endlocal
exit /b 0
