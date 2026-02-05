# Test Credentials (Non-Production)

**Use only for development and testing.** Do not use these accounts in production. Change or remove them before deploying to a live environment.

---

## Default user accounts

Seeded by the backend on first run (see `backend/app/database.py`). All data is non-production.

| Username | Password   | Role    | PIN  | Purpose                    |
|----------|------------|---------|------|----------------------------|
| **admin**  | **admin123** | admin   | 0000 | Full access; Close Shift, Admin PIN |
| **cashier**| **cashier123** | cashier | 1234 | POS, held orders, shifts   |
| **jane**   | **jane123**   | cashier | 5678 | Second cashier (testing)  |

---

## Admin PIN (Close Shift / Z-Report)

- **PIN:** `0000` (same as admin user’s PIN)
- Used when closing a shift or generating a Z-Report. Any active admin’s PIN is accepted.

---

## API / TestSprite

- **Login:** `POST /users/login` with `{"username": "admin", "password": "admin123"}` (or cashier/jane).
- **Shifts / held orders:** Use `cashier_id: 1` (admin) or `2` (cashier), `3` (jane) as appropriate for tests.

---

## Changing or removing test users

- In the app: **Admin → Users & Staff** — edit or deactivate users.
- For a fresh DB: delete `pos.db` (or run migrations on an empty DB); backend will re-seed admin and sample cashiers on next start.
