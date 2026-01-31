# DukaPOS – Testing

Testing strategy, conventions, and how to run tests quickly.

---

## 1. Test layers

| Layer | Where | How to run |
|-------|--------|------------|
| **Backend unit** | `backend/tests/` | `npm run test` or `cd backend && pytest tests -v` |
| **Backend API (TestSprite)** | `testsprite_tests/TC*.py` | `npm run test:testsprite` or `python testsprite_tests/run_all_tests.py` |
| **Frontend unit** | `electron/src/renderer/` | `npm run test:frontend` |
| **E2E / UI** | (future) | Prefer semantic selectors and explicit waits (see §2). |

Acceptance criteria are kept in **docs/PRD.md** (§9) and aligned with product decisions (§8).

---

## 2. Semantic selectors and explicit waits

For **E2E, UI, or browser-based tests**, prefer:

- **Semantic selectors** over brittle class/ID or XPath:
  - `data-testid="..."` for stable, test-only hooks.
  - `role` and `aria-*` (e.g. `getByRole("button", { name: "Complete Sale" })`, `aria-label`, `aria-checked`) so tests reflect accessibility and intent.
  - Avoid relying on internal class names or DOM structure that may change with styling.
- **Explicit waits** instead of fixed `sleep()`:
  - Wait for a specific element or state (e.g. “receipt printed”, “cart empty”) with a timeout.
  - Use `wait-on` or framework helpers (e.g. Playwright `expect(locator).toBeVisible()`) rather than arbitrary delays.

The renderer already uses `aria-*` in places (e.g. Settings toggles, pagination). When adding UI tests, add `data-testid` where needed and document selectors in this doc or in test files.

---

## 3. Targeted reruns for speed

Use **small, targeted reruns** for fast iteration instead of the full suite every time.

### TestSprite (backend API)

- **Run a subset by test ID** (e.g. TC001, TC002, TC005):
  ```bash
  python testsprite_tests/run_all_tests.py TC001 TC005
  ```
- **Run a single test file**:
  ```bash
  python testsprite_tests/TC002_products_crud_operations_should_work_correctly.py
  ```
- **Run full suite**:
  ```bash
  npm run test:testsprite
  ```

Backend must be running on port 8000. See **testsprite_tests/README.md**.

### Backend unit

- **Run one test file**:
  ```bash
  cd backend && python -m pytest tests/test_health.py -v
  ```
- **Run one test by name**:
  ```bash
  cd backend && python -m pytest tests/test_users_login.py::test_login_success_admin -v
  ```

---

## 4. Commit changes regularly

**Commit changes regularly** so that:

- Diff-based regeneration (e.g. TestSprite, codegen, CI) stays accurate.
- History reflects small, reviewable steps.
- Rollback and bisect are easier.

Suggested workflow:

- Make a small, logical change (e.g. one feature or one fix).
- Run the relevant **targeted** tests (see §3).
- Commit with a clear message (e.g. `fix: optional cashier_id for GET /orders/held/{id}`).
- Push when a feature or fix is complete.

See **README.md** for branch/PR guidance if applicable.
