# DukaPOS – Testing

Testing strategy, conventions, and how to run tests quickly.

---

## 1. Test layers

| Layer | Where | How to run |
|-------|--------|------------|
| **Backend unit/API** | `backend/tests/` | `cd backend && .venv\Scripts\python.exe -m pytest tests -v` |
| **Frontend unit** | `electron/src/renderer/` | `cd electron\src\renderer && npm run test` |
| **E2E / UI** | `electron/tests/` | `cd electron && npx playwright test` |

Acceptance criteria are kept in **docs/PRD.md** (§9) and aligned with product decisions (§8).

---

## 2. Semantic selectors and explicit waits

For **E2E, UI, or browser-based tests**, prefer:

- **Semantic selectors** over brittle class/ID or XPath:
  - `data-testid="..."` for stable, test-only hooks.
  - `role` and `aria-*` (e.g. `getByRole("button", { name: "Complete Sale" })`, `aria-label`, `aria-checked`) so tests reflect accessibility and intent.
  - Avoid relying on internal class names or DOM structure that may change with styling.
- **Explicit waits** instead of fixed `sleep()`:
  - Wait for a specific element or state (e.g. "receipt printed", "cart empty") with a timeout.
  - Use `wait-on` or framework helpers (e.g. Playwright `expect(locator).toBeVisible()`) rather than arbitrary delays.

The renderer already uses `aria-*` in places (e.g. Settings toggles, pagination). When adding UI tests, add `data-testid` where needed and document selectors in this doc or in test files.

---

## 3. Targeted reruns for speed

Use **small, targeted reruns** for fast iteration instead of the full suite every time.

### Backend tests (pytest)

- **Run the full backend suite**:
  ```bash
  cd backend && .venv\Scripts\python.exe -m pytest tests -vv
  ```
- **Run one test file**:
  ```bash
  cd backend && .venv\Scripts\python.exe -m pytest tests/test_comprehensive.py -v
  ```
- **Run one test by name**:
  ```bash
  cd backend && .venv\Scripts\python.exe -m pytest tests/test_comprehensive.py::test_health_check -v
  ```
- **Run production-critical tests only**:
  ```bash
  cd backend && .venv\Scripts\python.exe -m pytest tests/test_production_critical.py -v
  ```

### Frontend tests (Vitest)

- **Run all frontend tests**:
  ```bash
  cd electron\src\renderer && npm run test
  ```

### E2E tests (Playwright)

- **Run all E2E tests**:
  ```bash
  cd electron && npx playwright test
  ```

### Unified test runner

- **Run all layers at once**:
  ```bash
  .\run_all_tests.bat
  ```

---

## 4. Test files reference

| File | Purpose |
|------|---------|
| `backend/tests/conftest.py` | Pytest fixtures (test DB, session, client) |
| `backend/tests/test_comprehensive.py` | Main suite: 21 tests covering health, products, transactions, shifts, customers, orders, settings, reports, bank, discounts, suppliers |
| `backend/tests/test_production_critical.py` | VAT logic, station-prefixed receipt IDs, staff limit enforcement |

---

## 5. Commit changes regularly

**Commit changes regularly** so that:

- Diff-based regeneration (e.g. codegen, CI) stays accurate.
- History reflects small, reviewable steps.
- Rollback and bisect are easier.

Suggested workflow:

- Make a small, logical change (e.g. one feature or one fix).
- Run the relevant **targeted** tests (see §3).
- Commit with a clear message (e.g. `fix: optional cashier_id for GET /orders/held/{id}`).
- Push when a feature or fix is complete.

See **README.md** for branch/PR guidance if applicable.
