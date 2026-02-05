@echo off
setlocal EnableDelayedExpansion
REM ============================================================
REM DukaPOS: Show this PC's IP address for multi-PC setup.
REM Run on the SERVER (Host) PC; give the shown URL to client PCs.
REM No administrator rights required.
REM ============================================================

set "PORT=8000"
set "SUGGESTED_IP="

echo.
echo DukaPOS - This PC's IP address ^(for client PCs to connect^)
echo ============================================================
echo.
echo Your network addresses ^(look for IPv4, usually 192.168.x.x or 10.x.x.x^):
echo.

REM Show full adapter and IPv4 output
ipconfig | findstr /c:"IPv4" /c:"Ethernet" /c:"Wireless" /c:"Wi-Fi" /c:"Adapter"

echo.
echo ------------------------------------------------------------
echo.

REM Try to suggest first non-loopback IPv4 (for copy-paste)
for /f "tokens=2 delims=: " %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "CAND=%%a"
    set "CAND=!CAND: =!"
    if defined CAND if "!CAND:~0,8!" neq "127.0.0" (
        if not defined SUGGESTED_IP set "SUGGESTED_IP=!CAND!"
    )
)
if defined SUGGESTED_IP (
    echo Suggested Host URL for client PCs:  http://%SUGGESTED_IP%:%PORT%
    echo ^(Copy this into DukaPOS Settings - Host PC address on each client^)
) else (
    echo Pick an IPv4 address from above ^(not 127.0.0.1^) and use:  http://[IPv4]:%PORT%
)

echo.
echo On CLIENT PCs:
echo   1. Open DukaPOS - Admin - Settings and Backups
echo   2. Set Connection mode to "Client ^(another PC^)"
echo   3. Set Host PC address to:  http://[THIS_PC_IP]:%PORT%
echo      Example: http://192.168.88.10:%PORT%
echo ============================================================
echo.
pause

endlocal
exit /b 0
