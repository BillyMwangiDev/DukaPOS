# TestSprite tests (DukaPOS)

Run these tests **after** the backend is running with the **latest code** on port 8000.

## Run all tests

1. **Start the backend** (if not already running):
   ```bash
   npm run start:backend
   ```
   Or: `cd backend && python -m uvicorn main:app --port 8000`

2. **Run TestSprite tests** (from repo root):
   ```bash
   npm run test:testsprite
   ```
   Or: `python testsprite_tests/run_all_tests.py`

If you see 422/400 or "description"/"address" errors, **restart the backend** so it loads the fixes from `testsprite-mcp-test-report.md` §5, then run the tests again.

## Targeted reruns (fast iteration)

Use **small targeted reruns** instead of the full suite when iterating:

```bash
# Run only TC001 and TC005
python testsprite_tests/run_all_tests.py TC001 TC005

# Run only TC002 (products CRUD)
python testsprite_tests/run_all_tests.py TC002

# Run a single test file directly
python testsprite_tests/TC001_get_health_endpoint_should_return_status_ok.py
```

See **docs/TESTING.md** for more on targeted reruns and semantic selectors.
