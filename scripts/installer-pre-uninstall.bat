@echo off
setlocal
REM ============================================================
REM DukaPOS: Installer pre-uninstall hook (for NSIS or other).
REM Call this BEFORE uninstalling DukaPOS to remove the firewall
REM rule if this PC was the server (so no leftover rule remains).
REM
REM Usage:
REM   installer-pre-uninstall.bat [--silent | -s]
REM
REM Run as Administrator if you want the rule removed; otherwise
REM the script exits 0 and the rule is left in place (user can
REM remove manually with firewall-remove-backend.bat).
REM
REM Exit code: 0 always (best-effort remove; uninstall continues).
REM ============================================================

set "SCRIPT_DIR=%~dp0"
set "SILENT=0"
if /i "%~1"=="--silent" set "SILENT=1"
if /i "%~1"=="-s" set "SILENT=1"
if defined DUKAPOS_SILENT set "SILENT=1"

set "DUKAPOS_SILENT=1"
call "%SCRIPT_DIR%firewall-remove-backend.bat" --silent

endlocal
exit /b 0
