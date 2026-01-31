# DukaPOS

Offline-first Point of Sale for small businesses in Kenya. Electron + React (Vite) + FastAPI, VAT-inclusive pricing (16%), M-Pesa, Excel inventory import, thermal receipt + cash drawer, shifts, customers (Credit), held orders, and optional KRA eTIMS.

---

## How to install

| Who | What to use | Needs Python/Node? |
|-----|-------------|--------------------|
| **Shop / end user** | Option A — run the installer | **No** |
| **Developer** (run from code or build installer) | Option B or One-command | Yes |

---

### Option A: Install from installer (end users — no developer tools needed)

Use this if you received **DukaPOS Setup.exe** from your vendor or built it yourself. No Python or Node.js required on the PC.

1. **Download** the installer (e.g. **DukaPOS Setup x.x.x.exe**).
2. **Run** the installer. If Windows SmartScreen appears, choose "More info" → "Run anyway" (the app is not store-signed).
3. **Choose** install folder if prompted; leave "Create desktop shortcut" checked.
4. **Launch** DukaPOS from the Start menu or the desktop shortcut.
5. **Log in:** default **admin** / **admin123** (change in Admin → Users after first login). Sample cashier: **cashier** / **cashier123**.

Your data is stored in **%APPDATA%\\DukaPOS\\data\\pos.db** and is kept when you update the app.

**Confirmation:** Option A is the only installation type that does **not** require Python or Node.js. It works on any Windows PC where you run the installer; the app bundles everything it needs (including the backend).

---

### Option B: Install from source (developers only)

You need **Python 3.11+** and **Node.js 18+** installed ([python.org](https://www.python.org/downloads/), [nodejs.org](https://nodejs.org/) LTS).

1. **Clone the repository**
   ```bash
   git clone https://github.com/BillyMwangiDev/DukaPOS.git
   cd DukaPOS
   ```

2. **Backend (Python)**
   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   # On Linux/macOS: source .venv/bin/activate
   pip install -r requirements.txt
   cd ..
   ```

3. **Environment (root `.env`)**
   ```bash
   copy .env.example .env   # Windows
   # On Linux/macOS: cp .env.example .env
   ```
   Edit `.env` if needed (database path, API port, printer, M-Pesa keys). All config is in the **root `.env`** file.

4. **Frontend (Node / Electron)**
   ```bash
   npm install
   cd electron && npm install && cd ..
   cd electron\src\renderer && npm install && cd ..\..\..
   # On Linux/macOS: cd electron/src/renderer && npm install && cd ../../..
   ```

5. **Run the app**
   ```bash
   npm run dev
   ```
   This starts the backend and Electron; the DukaPOS window opens. Default API: **http://localhost:8000**.

   - Backend only: `npm run start:backend`
   - Electron only (if backend already running): `cd electron && npm run dev`

### Ensure apps are running (standard ports)

| Service | Port | How to run | How to verify |
|---------|------|------------|---------------|
| **Backend (FastAPI)** | **8000** | `npm run start:backend` or `cd backend && python -m uvicorn main:app --port 8000` | Open http://localhost:8000/health — should return `{"status":"ok"}`. Or: `curl http://localhost:8000/health` (PowerShell: `Invoke-RestMethod http://localhost:8000/health`). |
| **Frontend (Vite dev)** | **5173** | Used only when running `npm run dev` (Electron loads the renderer). Standalone: `cd electron/src/renderer && npm run dev` | Open http://localhost:5173 in a browser. |
| **Full app (Electron)** | — | `npm run dev` (backend + Electron; backend on 8000, Electron window opens) | DukaPOS window opens; login with test credentials (see **docs/TEST_CREDENTIALS.md**). |

Frontend and backend are accessible on these standard ports when run from source. For packaged installs, the backend is spawned by Electron and listens on 8000–8010 (first free).

### One-command install (from source)

From repo root, after cloning:

```bash
npm run install:all
```

This runs: `npm install` → Electron install → renderer install → backend `pip install -r requirements.txt`. Then (from repo root) copy `.env.example` to `.env`, and run:

```bash
cd ..   # if you're still in backend/ after install:all
copy .env.example .env   # Windows; on Linux/macOS: cp .env.example .env
npm run dev
```

---

## Project structure

Descriptive folder layout and setup entry points:

```
DukaPOS/
├── README.md                 # This file: setup, usage, build
├── package.json              # Root scripts: dev, build, test, start:backend
├── .env.example              # Copy to .env; root config for backend + frontend
├── backend/                  # FastAPI backend (Python)
│   ├── main.py               # App entry; uvicorn runs here
│   ├── requirements.txt     # Python dependencies
│   ├── app/                  # Core app: models, database, config, auth
│   │   ├── routers/          # API routes: products, transactions, shifts, users, etc.
│   │   └── ...
│   ├── tests/                # Backend pytest tests
│   └── backups/              # SQLite backups (created at runtime)
├── electron/                 # Electron shell + Vite/React frontend
│   ├── src/
│   │   ├── main/             # Electron main process (spawns backend, injects port)
│   │   └── renderer/         # Vite + React + Tailwind UI (POS, Admin, Inventory)
│   └── package.json          # electron-builder, build config
├── docs/                     # Documentation
│   ├── PRD.md                # Product Requirements Document
│   └── TEST_CREDENTIALS.md   # Test user accounts (non-production)
├── scripts/                  # Installer and LAN helper scripts
│   ├── firewall-allow-backend.bat
│   ├── get-server-ip.bat
│   └── README.md
└── testsprite_tests/         # TestSprite backend API tests (run with backend up)
    ├── run_all_tests.py
    └── README.md
```

- **backend/** — FastAPI, SQLModel (SQLite), products CRUD, transactions, shifts, customers, held orders, inventory upload, print/receipt, cash drawer, system backup, optional eTIMS CSV and VSCU payload.
- **electron/** — Main process (spawns backend, health check, injects port); renderer = Vite + React + Tailwind at `src/renderer/`.
- **docs/** — PRD, test credentials (non-production).
- **scripts/** — Firewall, get-server-ip, post-install (see `scripts/README.md`).
- **testsprite_tests/** — Backend API test scripts; run after backend is up (see `testsprite_tests/README.md`).

## Usage

- **Login** — Use admin/cashier credentials; cashier_id drives shifts and held orders.
- **F2** — Focus barcode/search
- **F3** — Toggle Return Mode (red UI, negative qty)
- **\*N** then scan — Add N units (e.g. *5 then barcode)
- **Hold order** — Saves cart per cashier; "Held Orders" to restore or discard.
- **Shifts** — Open shift (float) before payments; Close Shift (Admin PIN) for Z-Report.
- **Inventory** tab — "Import Excel/CSV" → `POST /inventory/upload` (columns: name, barcode, price_buying, price_selling, stock_quantity, min_stock_alert).
- **Admin** — Dashboard, Sales Reports, Inventory, Users & Staff, Customers (Credit), Tax & eTIMS (optional), Settings & Backups. Shop name from Settings appears in header/sidebar.

## Optional eTIMS (KRA)

eTIMS is **optional** for buyers. When disabled, a local invoice sequence is used. When enabled in Settings:

- **Export KRA eTIMS CSV** from Admin → Tax & eTIMS (date range).
- **VSCU payload** for a transaction: `GET /tax/vscu-payload?transaction_id=…` — use with your own VSCU/KRA integration. No live KRA call is made from DukaPOS.

## Multi-terminal & On-Premise

- **Host (this PC):** Electron spawns the backend; database in packaged app is stored in user data (`%APPDATA%/DukaPOS/data/pos.db`) so updates do not wipe data.
- **Client (another PC):** In Settings → Connection mode choose **Client** and enter the Host PC address, e.g. `http://192.168.88.10:8000`.
- **Firewall:** On the Host PC, allow inbound TCP on port 8000 (or your backend port). Run as Administrator: `scripts\firewall-allow-backend.bat` or see **docs/PRD.md** (Deployment).

### Installing on three PCs (one as server)

Use **one PC as the server (Host)** and the other two as **clients**. All three use the **same installer**; no developer tools needed.

| PC | Role | What to do |
|----|------|------------|
| **PC 1** | **Server (Host)** | 1) Install DukaPOS (Option A). 2) Run DukaPOS (it runs in Host mode by default). 3) Find this PC’s IP: open Command Prompt, run `ipconfig`, note the IPv4 address (e.g. `192.168.88.10`). 4) Allow firewall: open **Command Prompt as Administrator**, run: `netsh advfirewall firewall add rule name="DukaPOS Backend" dir=in action=allow protocol=TCP localport=8000` (or run `scripts\firewall-allow-backend.bat` as admin if you have the DukaPOS source folder). |
| **PC 2 & PC 3** | **Clients** | 1) Install DukaPOS (Option A) on each. 2) Run DukaPOS. 3) Go to **Admin** → **Settings & Backups**. 4) Under **Connection mode**, select **Client (another PC)**. 5) In **Host PC address**, enter `http://<Server-IP>:8000` (e.g. `http://192.168.88.10:8000`). 6) Click **Save connection & eTIMS**. 7) Log in; all sales go to the server’s database. |

All three PCs must be on the **same LAN** (same Wi‑Fi or same network). The server (PC 1) should stay on and running DukaPOS so the clients can connect. For more detail (finding IP, firewall, troubleshooting), see **docs/PRD.md** (Deployment).

## Backend build (PyInstaller)

To build the backend as a single executable (e.g. `server.exe` for Electron packaging):

```bash
cd backend
pip install pyinstaller
pyinstaller dukapos_server.spec
```

Output: `dist/server.exe` (Windows) or `dist/server` (Linux/macOS). See **backend/dukapos_server.spec** for build options.

## Building the installer (for developers / vendors)

To produce the **DukaPOS Setup.exe** that end users install (Option A), from repo root:

```bash
npm run build:backend
npm run build:electron
```

Or: `npm run build`. The installer is created in **electron/dist/** (e.g. `DukaPOS Setup 0.1.0.exe`). Give that file to the shop; they run it and do **not** need Python or Node.js. See **docs/PRD.md** for LAN setup and firewall.

## Development workflow

- **Commit changes regularly** so diff-based regeneration (e.g. TestSprite, CI) stays accurate and history remains reviewable. Prefer small, logical commits with clear messages.
- Use **targeted test reruns** for fast iteration (e.g. `python testsprite_tests/run_all_tests.py TC002`). See **docs/TESTING.md**.

## Docs

- **README.md** — This file: installation, usage, build.
- **docs/PRD.md** — Product Requirements Document: goals, features, product decisions, acceptance criteria, deployment.
- **docs/TESTING.md** — Testing strategy, semantic selectors, targeted reruns, commit guidance.
- **docs/TEST_CREDENTIALS.md** — Test user accounts (non-production).
