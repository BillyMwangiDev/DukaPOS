# DukaPOS — Offline-first POS for Kenyan Retail

DukaPOS is a production-grade, offline-first Point of Sale system for small businesses in Kenya. It runs as a self-contained Windows desktop app: an Electron shell wrapping a React UI, with a FastAPI/SQLite backend bundled as `server.exe` — no Python or Node.js required on the end-user's machine.

<img width="1910" height="984" alt="POS checkout screen" src="https://github.com/user-attachments/assets/87f601b3-3e60-4f72-a914-e7502e12ed57" />

<img width="972" height="657" alt="Admin dashboard" src="https://github.com/user-attachments/assets/bf4ddbd9-4921-4f57-be2b-41a93e2950ac" />

<img width="1906" height="990" alt="Inventory management" src="https://github.com/user-attachments/assets/9e2c7440-f9ca-4351-b7ab-fe38e083169b" />

<img width="1906" height="1000" alt="Sales reports" src="https://github.com/user-attachments/assets/43902ebb-cdca-4617-a91e-d68523dc7137" />

---

## Features

| Area | Capabilities |
|------|-------------|
| **Checkout** | Barcode scan, cart, hold orders, return mode, multi-tender (Cash + M-Pesa + Credit + Bank) |
| **Payments** | M-Pesa STK Push (Daraja API), manual confirm, Buy Goods till, Paybill, cash change calc |
| **Inventory** | Product CRUD, category filter, stock adjustments, low-stock alerts, suppliers & purchase orders |
| **Customers** | Credit accounts, debt limits, loyalty points (1 pt / KSh 100), receipt history |
| **Shifts** | Open/close with float, Z-Report, cash denomination count, cashier audit |
| **Reports** | Daily summary, sales by date range, top products, slow movers, hourly heatmap — export CSV/Excel |
| **Admin** | Staff management (roles: admin/cashier/developer), discounts, store settings, backup/restore |
| **KRA eTIMS** | CSV export; live API stub (set `ENABLE_ETIMS=true`) |
| **Hardware** | ESC/POS thermal printer, RJ11 cash drawer kick, barcode scanner (HID keyboard input) |

---

## Technology stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 33 |
| Frontend | React 18 · TypeScript 5.6 · Vite 6 · TailwindCSS 3 · Zustand |
| Backend | Python FastAPI 0.115 · Uvicorn |
| ORM / DB | SQLModel (SQLAlchemy + Pydantic) · SQLite WAL |
| Auth | bcrypt (passwords + PINs) |
| Payments | Safaricom Daraja API (STK Push + C2B) |
| Printing | python-escpos |
| Packaging | PyInstaller → `server.exe` · electron-builder (NSIS installer) |
| Testing | Pytest · Vitest · Playwright |
| CI/CD | GitHub Actions |

---

## Developer setup

**Prerequisites:** Python 3.11+, Node.js 20+, npm

```bash
# 1. Clone and one-time setup
git clone <repo>
cd DukaPOS
setup.bat          # creates .venv, installs Python deps + Node deps

# 2. Start development (Vite dev server + Electron + backend auto-spawned)
cd electron
npm run dev
```

The Electron main process spawns `python backend/main.py` on the first free port in 8000–8010 and injects it into the renderer via `window.__DUKAPOS_BACKEND_PORT__`.

**Swagger UI** (backend only): `http://localhost:8000/docs`

---

## Build commands

### Step 1 — Build backend → `server.exe`

```bash
cd backend

# Option A: local dev with .venv (created by setup.bat)
.\build_backend.bat

# Option B: system Python / CI (no venv required)
pip install -r requirements.txt
python -m PyInstaller dukapos_server.spec --clean --noconfirm
```

Output: `backend/dist/server.exe`

### Step 2 — Build Electron installer

```bash
cd electron
npm ci
cd src/renderer && npm ci --legacy-peer-deps && cd ../..
npm run build
```

Output: `electron/dist/DukaPOS Setup 0.1.0.exe` (~130 MB NSIS installer)

> Requires ~4 GB RAM. The build script passes `--max-old-space-size=4096`.

---

## Running tests

```bash
# All layers at once
.\run_all_tests.bat

# Backend (pytest — 21 tests)
cd backend
.venv\Scripts\python.exe -m pytest tests -vv

# Frontend unit tests (Vitest — 39 tests)
cd electron/src/renderer
npm run test

# E2E smoke tests (Playwright — 3 tests, requires built renderer + running backend)
cd electron
npx playwright test
```

See [docs/TESTING.md](docs/TESTING.md) for targeted reruns and CI details.

**Current test status:** all 21 backend + 39 frontend + 3 e2e tests pass on CI.

---

## CI/CD pipeline

`.github/workflows/production.yml` runs on every push/PR to `main`:

| Job | Runner | What it does |
|-----|--------|-------------|
| `lint-and-audit` | ubuntu | `tsc --noEmit`, `npm audit`, `ruff check`, `pip-audit` |
| `test-backend` | ubuntu | `pytest` (21 tests) |
| `test-frontend` | windows-latest | Vitest (39 tests) + Playwright e2e (3 tests) |
| `build-production` | windows-latest | PyInstaller → `server.exe`, electron-builder → `.exe` installer, uploads artifact |

The installer artifact (`DukaPOS-Installer`) is available on every successful `main` push under **Actions → build-production → Artifacts**.

---

## Environment variables

Copy `.env.example` → `.env` in the project root before first run.

```ini
# Database
DATABASE_URL=sqlite:///./dukapos.db

# API server
API_HOST=0.0.0.0
API_PORT=8000

# Security — CHANGE BOTH IN PRODUCTION
SECRET_KEY=generate_a_secure_random_key_here
API_KEY=                    # optional: protects API for LAN clients

# M-Pesa Daraja
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_PASSKEY=
MPESA_SHORTCODE=174379
MPESA_CALLBACK_URL=https://your-domain.com/mpesa/callback
MPESA_ENV=sandbox           # sandbox | production

# POS identity
STATION_ID=POS-01
STAFF_LIMIT=5

# Hardware (USB thermal printer)
PRINTER_TYPE=usb
PRINTER_VENDOR_ID=0x0483
PRINTER_PRODUCT_ID=0x5743

# Features
ENABLE_ETIMS=false
```

---

## Production deployment checklist

Complete all of the following before handing the installer to a customer:

- [ ] **Change default credentials** — log in as admin and delete/rename the seeded accounts:
  - `admin` / `admin123` / PIN `0000`
  - `cashier` / `cashier123` / PIN `1234`
  - `jane` / `jane123` / PIN `5678`
- [ ] **Set `SECRET_KEY`** — `python -c "import secrets; print(secrets.token_hex(32))"`
- [ ] **Set `API_KEY`** in `.env` for any multi-PC (LAN) installation
- [ ] **Configure M-Pesa** credentials (`.env` or Admin → Settings → M-Pesa)
- [ ] **Run firewall script** for LAN mode — `scripts/firewall-allow-backend.bat`
- [ ] **Connect and test printer** — Admin → Settings → Print Test Receipt
- [ ] **Open the first shift** before accepting payments

---

## Project structure

```
DukaPOS/
├── README.md
├── CLAUDE.md                          ← developer guide (conventions, architecture)
├── .env.example                       ← copy to .env
├── setup.bat                          ← one-time dev setup
├── run_all_tests.bat                  ← runs all test layers
├── backend/
│   ├── main.py                        ← FastAPI entry point
│   ├── dukapos_server.spec            ← PyInstaller spec
│   ├── build_backend.bat              ← local build (needs .venv)
│   ├── requirements.txt
│   └── app/
│       ├── models.py                  ← SQLModel ORM models
│       ├── database.py                ← engine, migrations, seed data
│       ├── routers/                   ← API route handlers
│       └── tests/                     ← pytest suite
├── electron/
│   ├── package.json                   ← scripts + electron-builder config
│   ├── src/
│   │   ├── main/main.ts               ← Electron main process
│   │   └── renderer/src/
│   │       ├── App.tsx                ← root component
│   │       ├── components/            ← UI screens and modals
│   │       └── hooks/                 ← cart (Zustand), WebSocket, idle lock
│   └── tests/e2e.spec.ts              ← Playwright smoke tests
├── docs/
│   ├── PRD.md                         ← product requirements
│   ├── TESTING.md                     ← test strategy
│   └── TEST_CREDENTIALS.md            ← default login credentials
└── customer_manual.md                 ← end-user guide
```

---

Built by **BillyMwangiDev**
