# DukaPOS — Testing

Testing strategy, conventions, and how to run tests.

---

## 1. Test layers

| Layer | Location | Count | Status |
|-------|----------|-------|--------|
| **Backend unit/API** | `backend/tests/` | 21 | ✅ all passing |
| **Frontend unit** | `electron/src/renderer/` | 39 | ✅ all passing |
| **E2E / smoke** | `electron/tests/` | 3 | ✅ all passing |

---

## 2. Running tests

### All layers at once

```bash
.\run_all_tests.bat
```

### Backend (pytest)

```bash
# Full suite
cd backend
.venv\Scripts\python.exe -m pytest tests -vv

# One file
.venv\Scripts\python.exe -m pytest tests/test_comprehensive.py -v

# One test by name
.venv\Scripts\python.exe -m pytest tests/test_comprehensive.py::test_health_check -v

# Production-critical only (VAT, receipt ID, staff limit)
.venv\Scripts\python.exe -m pytest tests/test_production_critical.py -v
```

### Frontend unit (Vitest)

```bash
cd electron/src/renderer
npm run test
```

### E2E smoke tests (Playwright)

Requires the renderer to be built and a running backend:

```bash
# Build renderer first (one-time or when code changes)
cd electron/src/renderer && npm run build && cd ../..

# Start backend in a separate terminal
cd backend && .venv\Scripts\python.exe main.py

# Run Playwright tests
cd electron
npx playwright test

# Show trace on failure
npx playwright show-trace test-results/<test-folder>/trace.zip
```

In CI the backend is started automatically by the `test-frontend` job.

---

## 3. Test file reference

| File | Purpose |
|------|---------|
| `backend/tests/conftest.py` | Pytest fixtures: in-memory SQLite test DB, HTTPX test client |
| `backend/tests/test_comprehensive.py` | 21 tests — health, products, transactions, shifts, customers, held orders, settings, reports, bank payments, discounts, suppliers |
| `backend/tests/test_production_critical.py` | VAT math, station-prefixed receipt IDs (`POS-01-00001`), staff limit enforcement |
| `electron/src/renderer/src/**/*.test.*` | Vitest unit tests for frontend utilities and components |
| `electron/tests/e2e.spec.ts` | 3 Playwright smoke tests (Auth, Transaction, Reports) |

---

## 4. E2E test design

The three Playwright smoke tests share a single Electron instance (`beforeAll` / `afterAll`):

1. **Auth** — verifies all three nav tabs (Point of Sale, Inventory, Admin) are visible and unblocked after login.
2. **Transaction** — Inventory → click product → POS → M-PESA Till → Manual Confirm → Finalize. Asserts `text=Sale completed!`.
3. **Reports** — Admin → Sales Reports → Excel. Asserts `text=EXCEL downloaded` (the success toast).

**Resilience built in:** `beforeAll` handles any blocking modal after login (presses `Escape`, then opens a shift via the modal if the "Open Shift" button is still visible). This guards against CI seed failures and race conditions.

**Note on Excel export:** `SalesReportsScreen` uses `fetch → blob → URL.createObjectURL → <a download>.click()`. This is not a navigation-based download so Playwright's `waitForEvent('download')` never fires in Electron. The test verifies the success toast instead.

---

## 5. Selectors and waits

- Prefer **text-based selectors** (`button:has-text("...")`) and role selectors over CSS class names.
- Use **explicit waits** (`waitForSelector`, `expect(locator).toBeVisible()`) instead of arbitrary `waitForTimeout` where possible.
- Add `data-testid` attributes when a reliable stable selector is needed for a complex component.

---

## 6. CI behaviour

The `test-frontend` GitHub Actions job (runs on `windows-latest`):

1. Installs deps, compiles Electron main process, builds Vite renderer.
2. Starts the FastAPI backend (`python main.py &`), waits for `/system/health`.
3. Seeds test data: creates a product (`TESTSKU01`, `stock_quantity: 20`) and opens a shift for `staff_id=1`.
4. Installs Playwright browsers (`npx playwright install --with-deps`).
5. Runs `npx playwright test` — all 3 tests must pass.

---

## 7. Commit discipline

- Make small, logical changes.
- Run the targeted test layer before committing.
- Use descriptive prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `ci:`.
- Push when a feature or fix is complete and tests are green.
