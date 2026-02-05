@echo off
setlocal
REM ============================================================
REM DukaPOS: Installer post-install hook (for NSIS or other).
REM Call this AFTER installing DukaPOS.
REM
REM Usage:
REM   installer-post-install.bat [SERVER | CLIENT | ""]
REM
REM   SERVER  - This PC is the server; add firewall rule (requires
REM             Administrator - run installer as Admin or script will
REM             request elevation).
REM   CLIENT  - This PC is a client; no firewall change (no-op).
REM   (none)  - Same as CLIENT; no firewall change.
REM
REM For silent/unattended use, set DUKAPOS_SILENT=1 before calling.
REM Exit codes: 0 success, 1 not admin, 2 firewall add failed.
REM NOTE: For SERVER, the caller must run this script with Administrator
REM       rights (e.g. NSIS runs it elevated when user chose "Server").
REM ============================================================

set "MODE=%~1"
set "SCRIPT_DIR=%~dp0"
set "SILENT=0"
if defined DUKAPOS_SILENT set "SILENT=1"

if /i "%MODE%"=="SERVER" (
    REM Request admin and run firewall-allow (silent)
    set "RUN=%SCRIPT_DIR%firewall-allow-backend.bat"
    if %SILENT% equ 1 (
        set "DUKAPOS_SILENT=1"
        call "%RUN%" --silent
    ) else (
        call "%RUN%" --silent
    )
    exit /b %errorLevel%
)

REM CLIENT or empty: nothing to do
exit /b 0
