# DukaPOS — Developer Guide

## Project Overview
DukaPOS is an offline-first Point of Sale system for Kenyan retail. It runs as a Windows desktop application (Electron), with a FastAPI Python backend embedded as a sidecar process (`server.exe`). The UI is React + TypeScript + Vite + TailwindCSS.

**Target market:** Small-to-medium retail businesses in Kenya
**Key features:** Cash/M-Pesa/Credit/Bank payments, thermal printing, barcode scanning, shift management, inventory CRUD, VAT (16%) reporting, KRA eTIMS CSV export

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 33 |
| Frontend | React 18, TypeScript 5.6, Vite 6, TailwindCSS 3 |
| State | Zustand |
| Backend | Python FastAPI 0.115 + Uvicorn |
| ORM | SQLModel (SQLAlchemy + Pydantic) |
| Database | SQLite with WAL mode (upgradeable to PostgreSQL) |
| Auth | bcrypt (passwords + PINs) |
| Payments | Safaricom Daraja API (STK Push + C2B) |
| Printing | python-escpos (ESC/POS thermal printers) |
| Packaging | PyInstaller (backend → server.exe) + electron-builder (NSIS installer) |

---

## Dev Setup

**Prerequisites:** Python 3.11+, Node.js 20+, npm

```bash
# 1. Clone & setup (one-time)
git clone <repo>
cd DukaPOS
setup.bat          # Creates .venv, installs Python deps, installs npm deps

# 2. Start development
cd electron
npm run dev        # Starts Vite dev server + Electron (both in one command)
```

The Electron main process will spawn `python backend/main.py` in dev mode, finding a free port in 8000–8010.

**Alternatively, run backend only (for API testing):**
```bash
cd backend
.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Swagger UI: http://localhost:8000/docs  (dev mode only)
```

---

## Running Tests

```bash
# All tests (backend + frontend + e2e)
.\run_all_tests.bat

# Backend only (pytest)
cd backend
.venv\Scripts\python.exe -m pytest tests -vv

# Frontend unit tests (Vitest)
cd electron\src\renderer
npm run test

# E2E tests (Playwright, requires Chrome)
cd electron
npx playwright test
```

---

## Build to .exe (Distribution)

Produces `electron/dist/DukaPOS Setup 0.1.0.exe` — a Windows NSIS installer.

```bash
# Step 1: Build Python backend → server.exe
cd backend
.\build_backend.bat          # Runs PyInstaller with dukapos_server.spec
# Output: backend/dist/server.exe

# Step 2: Build Electron installer (bundles server.exe inside)
cd electron
npm run build                # Vite build + tsc + electron-builder (needs ~4GB RAM)
# Output: electron/dist/DukaPOS Setup 0.1.0.exe
```

**Notes:**
- `electron-builder` is configured with `--max-old-space-size=4096` for bundling
- The installer bundles `server.exe` as an extraResource
- NSIS wizard prompts users for M-Pesa Daraja credentials during install (optional)
- Windows SmartScreen may warn on first install (unsigned binary)

---

## Architecture

```
User
 └─ Electron (main.ts)
      ├── BrowserWindow → loads React app (Vite build or localhost:5173 in dev)
      ├── Spawns server.exe (or python main.py in dev) on port 8000–8010
      └── Injects window.__DUKAPOS_BACKEND_PORT__ into renderer
           └─ React (api.ts) reads port → API calls to http://localhost:{port}
```

**Data flow for a sale:**
1. Cashier scans barcode → `GET /products/barcode/{barcode}`
2. Items added to Zustand cart store
3. Cashier clicks Pay → `PaymentModal` opens
4. For M-Pesa: `POST /mpesa/stk-push` → Safaricom sends STK push → callback via `/mpesa/callback`
5. On payment complete: `POST /transactions` → creates Receipt + SaleItem rows + adjusts stock
6. `POST /print/receipt` → ESC/POS printer
7. `POST /hardware/kick-drawer` (cash payments only)

**Port management:** Electron finds the first free port in 8000–8010, passes it to both the backend process (env `API_PORT`) and the renderer (via `executeJavaScript`).

**Database:** SQLite at `%APPDATA%\DukaPOS\data\pos.db` in packaged mode; `backend/dukapos.db` in dev. WAL mode enabled for multi-reader concurrency.

---

## Key Conventions

- **All prices are VAT-inclusive (gross)** — Kenyan standard. Net = gross / 1.16, VAT = gross - net.
- **Receipt IDs:** Station-prefixed sequential format e.g. `POS-01-00001`. Defined in `InvoiceSequence` table.
- **Roles:** `admin` (full access), `cashier` (POS only), `developer` (system config)
- **Passwords:** bcrypt-hashed. PINs: bcrypt-hashed separately (4–6 digits).
- **Shifts:** Cash drawer must have an open shift before sales. Close shift generates Z-Report.
- **Stock:** Adjusted on every transaction. Returns add stock back (negative quantity).
- **KRA eTIMS:** CSV export only (no live API). Set `ENABLE_ETIMS=true` in `.env` to activate.

---

## Critical File Map

```
DukaPOS/
├── CLAUDE.md                          ← This file
├── .env                               ← Local config (not committed — see .env.example)
├── backend/
│   ├── main.py                        ← FastAPI app entry point
│   ├── dukapos_server.spec            ← PyInstaller config for server.exe
│   ├── build_backend.bat              ← Builds server.exe
│   ├── app/
│   │   ├── database.py               ← SQLite engine, migrations, seed data
│   │   ├── models.py                 ← SQLModel ORM models (Staff, Product, Receipt…)
│   │   ├── auth_utils.py             ← bcrypt helpers (hash_password, verify_password)
│   │   ├── auth_optional.py          ← Optional API key middleware (set API_KEY in .env)
│   │   ├── mpesa_utils.py            ← Daraja API helpers (send_stk_push, get_access_token)
│   │   ├── printer_service.py        ← ESC/POS printer driver
│   │   ├── websocket_manager.py      ← WebSocket broadcast manager + EventType enum
│   │   └── routers/
│   │       ├── users.py              ← Staff login, PIN verify, CRUD
│   │       ├── transactions.py       ← Create/list receipts (core sale endpoint)
│   │       ├── products.py           ← Product CRUD + barcode lookup
│   │       ├── mpesa.py              ← STK Push + Daraja webhook callbacks
│   │       ├── shifts.py             ← Open/close shift, Z-Report
│   │       ├── customers.py          ← Credit customer management
│   │       ├── reports.py            ← Sales reports (date range)
│   │       ├── dashboard.py          ← Daily summary stats
│   │       ├── settings.py           ← Store configuration
│   │       ├── system.py             ← Backup/restore
│   │       ├── api_keys.py           ← M-Pesa credential management
│   │       ├── discounts.py          ← Discount CRUD (percent/fixed, order/item scope)
│   │       ├── suppliers.py          ← Supplier & Purchase Order management
│   │       └── websocket_router.py   ← WebSocket /ws/{client_id} endpoint
│   └── tests/
│       ├── conftest.py               ← pytest fixtures (test DB)
│       ├── test_comprehensive.py     ← Main test suite (21 tests, TC001–TC021)
│       └── test_production_critical.py ← VAT, receipt ID, staff limit tests
├── electron/
│   ├── package.json                  ← Electron scripts + electron-builder config
│   ├── src/
│   │   ├── main/main.ts              ← Electron main process (backend spawn, window)
│   │   └── renderer/                ← React app
│   │       ├── package.json          ← Frontend deps (React, Vite, Zustand, Radix…)
│   │       └── src/
│   │           ├── App.tsx           ← Root component (login, shift, cart, admin)
│   │           ├── lib/api.ts        ← API base URL helper
│   │           ├── hooks/useCart.ts  ← Zustand cart store (items, totals, VAT)
│   │           ├── hooks/useWebSocket.ts ← WebSocket client + event subscriptions
│   │           └── components/
│   │               ├── PaymentModal.tsx    ← Cash/M-Pesa/Credit/Bank payment UI
│   │               ├── LoginScreen.tsx     ← Login form + getStoredUser/setStoredUser
│   │               └── admin/             ← Admin dashboard screens
│   └── tests/e2e.spec.ts            ← Playwright smoke tests
└── docs/
    ├── PRD.md                        ← Product requirements
    ├── TESTING.md                    ← Test strategy
    └── TEST_CREDENTIALS.md          ← Default login credentials
```

---

## Security Notes

### PRODUCTION DEPLOYMENT CHECKLIST
Before going live, complete all of the following:

- [ ] **Change default credentials** — Default accounts are seeded on first run:
  - `admin` / `admin123` / PIN `0000`
  - `cashier` / `cashier123` / PIN `1234`
  - `jane` / `jane123` / PIN `5678`
  - Delete or disable these accounts in the admin panel after creating real accounts.

- [ ] **Set API_KEY in .env** — Without this, the API has no authentication for LAN clients:
  ```
  API_KEY=your-random-secret-here
  ```

- [ ] **Generate a real SECRET_KEY** — Replace the placeholder in `.env`:
  ```
  SECRET_KEY=<run: python -c "import secrets; print(secrets.token_hex(32))">
  ```

- [ ] **Configure M-Pesa credentials** — Set in `.env` or via Admin > Settings:
  ```
  MPESA_CONSUMER_KEY=...
  MPESA_CONSUMER_SECRET=...
  MPESA_PASSKEY=...
  MPESA_SHORTCODE=...
  ```

- [ ] **Firewall** — Run `scripts/firewall-allow-backend.bat` if using multi-PC (LAN) mode

### Authentication Model
- The API uses **optional API key** middleware (`X-API-Key` header). If `API_KEY` env is unset, all endpoints are open (suitable for single-PC use on trusted LAN).
- Cashier login uses username + password (bcrypt). Session stored in sessionStorage (cleared on tab/window close).
- Admin actions (shift close, price override) require PIN verification.
- Any admin PIN also unlocks staff PIN verification (by design, for admin override capability).

---

## Known Unfinished Features

These features are stubbed or partially implemented:

| Feature | Status | Location |
|---------|--------|----------|
| Multi-PC sync | Mock only (`triggerSync()` shows info toast) | `DeveloperConsole.tsx` |
| Inventory bulk upload UI | Button exists, no click handler | `InventoryManagerScreen.tsx` |
| KRA eTIMS live API | CSV export + stub endpoint; no live KRA API | `tax_export.py` |
| C2B payment validation | Always accepts all payments | `mpesa.py:c2b-validation` |
| Bank payment API | Manual confirmation flag only | `transactions.py` |
| Barcode scanner hardware | Keyboard input only, no HID events | Frontend |

---

## Environment Variables (.env)

```ini
# Database
DATABASE_URL=sqlite:///./dukapos.db

# API server
API_HOST=0.0.0.0
API_PORT=8000

# Security (CHANGE THESE IN PRODUCTION)
SECRET_KEY=generate_a_secure_random_key_here
API_KEY=                    # Set to protect API for LAN clients

# M-Pesa Daraja
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_PASSKEY=
MPESA_SHORTCODE=174379
MPESA_CALLBACK_URL=https://your-ngrok-or-server.com/mpesa/callback
MPESA_ENV=sandbox           # sandbox or production

# POS identity
STATION_ID=POS-01
STAFF_LIMIT=5

# Hardware
PRINTER_TYPE=usb            # usb | serial | network
PRINTER_VENDOR_ID=0x0483
PRINTER_PRODUCT_ID=0x5743

# Features
ENABLE_ETIMS=false
DEV_MODE=false
LOG_LEVEL=INFO

# M-Pesa webhook security (optional: comma-separated Safaricom IPs)
MPESA_ALLOWED_IPS=196.201.214.200,196.201.214.206,196.201.213.114
```
