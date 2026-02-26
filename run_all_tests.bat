@echo off
echo ==========================================
echo    DukaPOS Unified Test Runner (CI Mode)
echo ==========================================

echo [1/3] Running Backend Pytests...
pushd backend
echo Installing test dependencies...
.venv\Scripts\python.exe -m pip install pytest pytest-asyncio httpx bcrypt
.venv\Scripts\python.exe -m pytest tests -vv --tb=long
if %errorlevel% neq 0 (
    echo [ERROR] Backend tests failed!
    popd
    exit /b %errorlevel%
)
popd

echo [2/3] Running Frontend Vitests...
pushd electron\src\renderer
call npm run test
if %errorlevel% neq 0 (
    echo [ERROR] Frontend Vitests failed!
    popd
    exit /b %errorlevel%
)
popd

echo [3/3] Running Playwright E2E Tests...
pushd electron
call npx playwright test
if %errorlevel% neq 0 (
    echo [ERROR] Playwright E2E tests failed!
    popd
    exit /b %errorlevel%
)
popd

echo.
echo ==========================================
echo    ALL TESTS PASSED!
echo ==========================================
