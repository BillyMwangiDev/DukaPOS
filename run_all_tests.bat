@echo off
echo ==========================================
echo    DukaPOS Unified Test Runner (CI Mode)
echo ==========================================

echo [1/3] Running Backend Pytests...
python -m pytest backend/tests/test_production_critical.py backend/tests/test_comprehensive.py -v
if %errorlevel% neq 0 (
    echo [ERROR] Backend tests failed!
    exit /b %errorlevel%
)

echo [2/3] Running Frontend Vitests...
cd electron\src\renderer
call npm run test
if %errorlevel% neq 0 (
    echo [ERROR] Frontend Vitests failed!
    exit /b %errorlevel%
)
cd ..\..\..

echo [3/3] Running Playwright E2E Tests...
cd electron
call npx playwright test
if %errorlevel% neq 0 (
    echo [ERROR] Playwright E2E tests failed!
    exit /b %errorlevel%
)
cd ..

echo.
echo ==========================================
echo    ALL TESTS PASSED!
echo ==========================================
