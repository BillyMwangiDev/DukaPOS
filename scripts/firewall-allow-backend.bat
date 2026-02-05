@echo off
setlocal EnableDelayedExpansion
REM ============================================================
REM DukaPOS: Allow inbound TCP on backend port for LAN clients.
REM Use on the SERVER PC only when you have 2+ PCs (multi-terminal).
REM Run as Administrator: right-click -> Run as administrator.
REM
REM Optional: run with --silent or -s (or set DUKAPOS_SILENT=1)
REM to skip pause and interactive messages (for installer use).
REM ============================================================

set "PORT=8000"
set "RULE_NAME=DukaPOS Backend"
set "SILENT=0"
if /i "%~1"=="--silent" set "SILENT=1"
if /i "%~1"=="-s" set "SILENT=1"
if defined DUKAPOS_SILENT set "SILENT=1"

REM Check for administrator (required for netsh advfirewall)
net session >nul 2>&1
if %errorLevel% neq 0 (
    if %SILENT% equ 0 (
        echo This script must be run as Administrator.
        echo Right-click the file and choose "Run as administrator".
        pause
    )
    exit /b 1
)

REM Remove existing rule with same name to avoid duplicate
netsh advfirewall firewall delete rule name="%RULE_NAME%" >nul 2>&1

REM Add rule
netsh advfirewall firewall add rule name="%RULE_NAME%" dir=in action=allow protocol=TCP localport=%PORT%
set "ADD_ERR=!errorLevel!"

if !ADD_ERR! equ 0 (
    if %SILENT% equ 0 (
        echo.
        echo [OK] Firewall rule added. Other PCs can connect to this server on port %PORT%.
        echo      Clients: in DukaPOS Settings set Host PC address to http://[THIS_PC_IP]:%PORT%
        echo      Run "get-server-ip.bat" on this PC to see this PC's IP address.
        echo.
        pause
    )
) else (
    if %SILENT% equ 0 (
        echo.
        echo [FAIL] Could not add firewall rule. Run Command Prompt as Administrator and run:
        echo        netsh advfirewall firewall add rule name="DukaPOS Backend" dir=in action=allow protocol=TCP localport=8000
        echo.
        pause
    )
    exit /b 2
)

endlocal
exit /b 0
