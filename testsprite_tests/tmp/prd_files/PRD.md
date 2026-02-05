# DukaPOS – Product Requirements Document (PRD)

**Version:** 1.0  
**Product:** DukaPOS – Offline-first Point of Sale for small businesses in Kenya.

---

## 1. Product overview

DukaPOS is a production-grade, **offline-first** Point of Sale (POS) system for small businesses in Kenya. It runs on low-spec Windows hardware, supports **single-PC** and **multi-PC (LAN)** setups, and addresses Kenyan market needs: **M-Pesa**, **VAT 16%** (inclusive), thermal receipts, cash drawer, shifts, customers (credit), and optional **KRA eTIMS** integration.

**Target users:** Shop owners, cashiers, and small retailers who need a reliable, installable POS without developer tools (installer) or with source for developers.

---

## 2. Goals and scope

| Goal | Description |
|------|-------------|
| **Offline-first** | Works without internet; M-Pesa manual code when offline; optional eTIMS when enabled. |
| **Kenyan retail** | KES, VAT-inclusive pricing (16%), M-Pesa (STK Push + manual code), shifts, credit (debtors). |
| **On-premise** | Single PC or LAN: one Host (backend + DB), optional Client PCs (same installer, connect to Host). |
| **No dev tools for end users** | One installer (DukaPOS Setup.exe); no Python/Node required. |
| **Hardware** | Thermal receipt printer, cash drawer kick, barcode scanner (HID). |

**Out of scope (by design):** Live KRA eTIMS call from DukaPOS (CSV/VSCU for buyer’s service); PostgreSQL in default installer (SQLite); store-signed app (SmartScreen may appear).

---

## 3. Technical stack (fixed)

| Layer | Technology |
|-------|------------|
| **Shell** | Electron (window, updates, spawns backend). |
| **Frontend** | React (Vite) + TypeScript + TailwindCSS + Shadcn/UI. |
| **Backend** | FastAPI (Python). |
| **Database** | SQLite (single/multi PC packaged); PostgreSQL optional for custom deployment. |
| **ORM** | SQLModel (SQLAlchemy + Pydantic). |
| **Backend packaging** | PyInstaller → `server.exe`, spawned by Electron; dev: `python main.py`. |
| **Printing** | python-escpos (receipt + cash drawer kick). |

---

## 4. Kenyan context and business rules

### 4.1 Currency and tax

- **Currency:** KES. Display: `Ksh 1,200.00`.
- **Tax:** All selling prices are **VAT-inclusive** (Standard 16%).
  - **Gross** = selling price (sticker).
  - **Net** = Gross / 1.16.
  - **Tax** = Gross − Net.
- Applied in Cart, CommandCenter, PaymentModal (line totals, subtotals, VAT breakdown, change).

### 4.2 Payment

- **Cash:** Amount tendered, change, cash drawer kick on complete, receipt.
- **M-Pesa:** Tabbed modal [Cash] | [M-Pesa]. STK Push (Daraja) + Manual Code Entry (Paybill). Offline: Manual Code only.
- **Credit:** Customer selection, debt limit check, balance update; Credit as payment method.

### 4.3 Keyboard and scanner

- **F2:** Focus barcode/search.
- **F3:** Return mode (red UI, negative qty).
- **\*N** then scan: add N units (e.g. *5 + barcode).
- Barcode: rapid keystrokes + Enter treated as scan; 500 ms debounce for duplicate scans.

### 4.4 Shifts and credit

- **Open shift** with opening float; sales attach to shift.
- **Close shift** with Admin PIN; Z-Report (expected vs actual cash).
- **Customers (Credit):** current_balance, debt_limit; Credit payment method; enforce balance ≤ debt_limit.

---

## 5. Features (implemented)

### 5.1 Point of Sale (checkout)

- Login; session; cashier_id for shifts and transactions.
- Search/barcode (F2); quantity override (*N); cart (VAT-inclusive; wholesale threshold).
- Return mode (F3; red theme; negative qty; is_return).
- Totals: subtotal (net), VAT 16%, total (gross).
- Numpad; Payment – Cash (tendered, change, drawer kick, receipt).
- Payment – M-Pesa (STK Push, callback, Check Status, manual code; optional verify API via env).
- Payment – Credit (customer, debt limit, balance update).
- Hold order (per cashier; list, restore, discard).
- Shifts (open float, close with Admin PIN, Z-Report).
- Low-stock warning; sound effects (optional); stock override (Admin PIN when out of stock).

### 5.2 Inventory

- Import Excel/CSV (file picker → POST /inventory/upload); pandas; upsert by barcode.
- Admin Inventory: product table, CRUD, low-stock alerts.

### 5.3 Admin

- Dashboard (today revenue, profit, VAT, tills; low stock); Z-Report; Manual Backup.
- Sales Reports (date range, bar/pie charts, CSV export).
- Users & Staff (list, create, edit; role; PIN; Admin PIN for Close Shift).
- Customers / Credit (list, search, create, edit, record payment; debt limit).
- Tax & eTIMS (date range; Export KRA eTIMS CSV; eTIMS optional toggle; VSCU payload for integration).
- Settings & Backups (shop info; auto-print, sound, low stock; backup history; Connection mode & Host PC address).
- Role-based access (cashier vs admin).

### 5.4 Backend API

- Health, products CRUD, transactions (cash/M-Pesa/credit; shift_id, customer_id, is_return; stock deduction).
- Shifts, customers, held orders, M-Pesa (STK, callback, verify-manual, C2B, verify status).
- Print (receipt, kick-drawer); inventory upload; settings; system backup/list/download.
- Tax (etims-csv, vscu-payload); reports; dashboard; users (login, verify-admin-pin).
- Optional API key auth when `API_KEY` env is set.

### 5.5 Hardware and touch

- Printer: Usb, Network, Serial (python-escpos); cash drawer kick; receipt template.
- PRINTER_OFFLINE when printer unavailable; non-blocking print/kick.
- Touch: scale feedback, no 300 ms delay; Complete Sale debounce (200 ms).

### 5.6 Optional integrations (env-gated)

- **API_KEY:** When set, non-public routes require X-API-Key or Bearer.
- **KRA_SUBMISSION_URL:** When set and not local invoice, VSCU payload POSTed after transaction (buyer’s KRA service).
- **M_PESA_VERIFY_API_URL:** When set, manual code verified via external API; otherwise any non-empty code accepted.

---

## 6. Deployment and installation

### 6.1 End users (no developer tools)

- **Option A – Installer:** Run **DukaPOS Setup.exe**. No Python/Node. Data: `%APPDATA%\DukaPOS\data\pos.db` (persists across updates).
- Default login: **admin** / **admin123**; sample cashier: **cashier** / **cashier123**.

### 6.2 Single PC

- Install and run; app runs in **Host** mode. Electron spawns backend (`server.exe` or `python main.py`). Database in user data path above.

### 6.3 Multi-PC (LAN) – one Host, rest Clients

- **Host (PC 1):** Install DukaPOS; run (Host mode). Find IP (e.g. `ipconfig` → IPv4). Allow firewall: **TCP port 8000** (run `scripts\firewall-allow-backend.bat` as Administrator or `netsh advfirewall firewall add rule name="DukaPOS Backend" dir=in action=allow protocol=TCP localport=8000`).
- **Clients (PC 2, 3, …):** Same installer. In app: **Admin → Settings & Backups → Connection mode: Client**; **Host PC address:** `http://<Server-IP>:8000`. Save.
- All PCs on same LAN; server must be on and running DukaPOS for clients to connect.

### 6.4 Data and ports

- **Database (packaged):** Windows `%APPDATA%\DukaPOS\data\pos.db`; Linux `~/.config/DukaPOS/data/pos.db`; macOS `~/Library/Application Support/DukaPOS/data/pos.db`.
- **Port:** 8000–8010 (first free); renderer gets port via `window.__DUKAPOS_BACKEND_PORT__`. Backend listens on 0.0.0.0 for LAN.
- **Firewall:** On Host, allow inbound TCP 8000 (or actual port). Remove rule: `netsh advfirewall firewall delete rule name="DukaPOS Backend"`.

### 6.5 Developers (from source)

- Python 3.11+, Node 18+. Clone; backend: venv, `pip install -r requirements.txt`; root `.env` from `.env.example`; `npm install` (root, electron, renderer). Run: `npm run dev`.
- Build backend: `npm run build:backend` (PyInstaller → `backend/dist/server.exe`).
- Build installer: `npm run build:electron` or `npm run build`. Output: `electron/dist/DukaPOS Setup x.x.x.exe`.

---

## 7. Project structure (high level)

- **backend/** – FastAPI, SQLModel, products, transactions, shifts, customers, held orders, inventory upload, print, system backup, optional eTIMS/VSCU.
- **electron/** – Main process (spawn backend, health check, inject port); renderer = Vite + React + Tailwind at `src/renderer/`.
- **scripts/** – Installer helpers: firewall allow/remove, get-server-ip, post-install server optional, installer hooks (see `scripts/README.md`).

---

## 8. Docs and references

- **README.md** – Installation (installer vs source), usage, multi-terminal, build.
- **docs/PRD.md** – This document (product requirements, features, deployment).
- **docs/TEST_CREDENTIALS.md** – Test user accounts (admin, cashier, jane) and Admin PIN; non-production only.

All product requirements, feature set, and deployment behavior are defined in this PRD; README remains the entry point for setup and usage.
