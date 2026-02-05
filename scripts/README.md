# DukaPOS – Installer scripts

Scripts for **one-PC** and **multi-PC (one server, several clients)** installations. Use them **after** installing DukaPOS with the Windows installer (Option A in the main README).

---

## Quick reference

| Scenario | Script(s) | Run as Administrator? |
|----------|-----------|------------------------|
| **One PC only** | None | — |
| **This PC is the server** (other PCs will connect) | `post-install-server-optional.bat` or `firewall-allow-backend.bat` | Yes (for firewall) |
| **Find server IP** (to give to client PCs) | `get-server-ip.bat` | No |
| **Remove server firewall rule** (uninstall server role or block LAN) | `firewall-remove-backend.bat` | Yes |
| **Installer hook: post-install** (e.g. NSIS) | `installer-post-install.bat SERVER` or `CLIENT` | Yes for SERVER |
| **Installer hook: pre-uninstall** | `installer-pre-uninstall.bat` | Optional (best-effort remove rule) |

---

## One PC (single till)

1. Install DukaPOS using **DukaPOS Setup.exe** (Option A in README).
2. Run DukaPOS from the Start menu or desktop shortcut.
3. **No scripts required.** The app runs in Host mode by default; everything is on this PC.

---

## Several PCs (one server, rest clients)

### On the **server** PC (runs backend and stores data)

1. Install DukaPOS with **DukaPOS Setup.exe**.
2. **Optional but recommended:** Run **`post-install-server-optional.bat`** as Administrator.
   - When asked *"Will other PCs connect to this one?"* answer **Y**.
   - This adds a Windows Firewall rule so client PCs can connect on port 8000.
3. Run **`get-server-ip.bat`** (no admin needed). Note the **Suggested Host URL** or **IPv4** (e.g. `192.168.88.10`).
   - On each **client** PC, in DukaPOS → Admin → Settings and Backups, set **Host PC address** to:  
     **`http://192.168.88.10:8000`** (use the IP from this script).

**If you prefer to add the firewall rule manually:**  
Run **`firewall-allow-backend.bat`** as Administrator (right‑click → Run as administrator).

### On each **client** PC

1. Install DukaPOS with the **same** **DukaPOS Setup.exe**.
2. Run DukaPOS → **Admin** → **Settings and Backups**.
3. Set **Connection mode** to **Client (another PC)**.
4. Set **Host PC address** to **`http://[SERVER_IP]:8000`** (e.g. `http://192.168.88.10:8000`).
5. Click **Save connection & eTIMS**.

No scripts needed on client PCs.

---

## Script reference

### End-user scripts

#### `post-install-server-optional.bat` [Y | N | SERVER | CLIENT] [--silent]

- **Use when:** You have 2+ PCs and **this** PC will be the server (or you want to confirm single-PC).
- **What it does:** Asks *"Will other PCs connect to this one?"* If you answer **Y**, it runs the firewall script so clients can reach this PC on port 8000.
- **Arguments (optional):**  
  - `Y` or `SERVER` – add firewall (no prompt).  
  - `N` or `CLIENT` – no firewall (no prompt).  
  - `--silent` / `-s` – no pause at end.
- **Run as Administrator:** Yes (for the firewall step to work).

#### `firewall-allow-backend.bat` [--silent | -s]

- **Use when:** This PC is the server and you want to allow inbound TCP on port 8000 for DukaPOS (so client PCs can connect).
- **What it does:** Adds a Windows Firewall rule: **DukaPOS Backend**, TCP port 8000, inbound, allow. Removes any existing rule with the same name first.
- **Arguments (optional):** `--silent` or `-s` (or set `DUKAPOS_SILENT=1`) – no pause, for installer use.
- **Run as Administrator:** Yes.

#### `firewall-remove-backend.bat` [--silent | -s]

- **Use when:** You no longer want this PC to accept DukaPOS connections from other PCs (e.g. uninstalling the server role or locking down the network).
- **What it does:** Deletes the **DukaPOS Backend** firewall rule.
- **Arguments (optional):** `--silent` or `-s` (or set `DUKAPOS_SILENT=1`).
- **Run as Administrator:** Yes.

#### `get-server-ip.bat`

- **Use when:** This PC is the server and you need to tell client PCs what **Host PC address** to use.
- **What it does:** Shows this PC’s network adapters and IPv4 addresses, and suggests a **Host URL** (first non-loopback IPv4) for copy-paste, e.g. `http://192.168.88.10:8000`.
- **Run as Administrator:** No.

---

### Installer hooks (for NSIS or custom installers)

#### `installer-post-install.bat` SERVER | CLIENT | ""

- **Use when:** Your installer (e.g. electron-builder NSIS or a custom setup) wants to add the firewall rule only when the user chooses “This PC is the server”.
- **Usage:**
  - `installer-post-install.bat SERVER` – add firewall rule (must run with Administrator rights).
  - `installer-post-install.bat CLIENT` or `installer-post-install.bat` – no-op.
- **Silent/unattended:** Set `DUKAPOS_SILENT=1` before calling to avoid extra output.
- **Exit codes:** 0 success, 1 not admin, 2 firewall add failed.
- **Note:** The installer must run this script **elevated** when the user selects “Server”; electron-builder’s default NSIS does not include a “Server/Client” page. You can add a custom NSIS page and run this script from it, or document that users run `post-install-server-optional.bat` manually after install.

#### `installer-pre-uninstall.bat` [--silent | -s]

- **Use when:** Your installer runs a step before uninstall and you want to remove the DukaPOS firewall rule so it does not remain after uninstall.
- **What it does:** Calls `firewall-remove-backend.bat --silent`. Best-effort; if not run as Administrator, the rule is left in place (user can remove with `firewall-remove-backend.bat`).
- **Exit code:** Always 0 (uninstall continues either way).

---

## Port

The backend uses **port 8000** by default (or the first free in 8000–8010). All firewall scripts use **8000**. If you change the backend port, add/remove the firewall rule with the same port, e.g. in Command Prompt (Administrator):

```batch
netsh advfirewall firewall add rule name="DukaPOS Backend" dir=in action=allow protocol=TCP localport=8000
netsh advfirewall firewall delete rule name="DukaPOS Backend"
```

---

## Where these scripts live

- **If you have the DukaPOS source (repo):** Scripts are in the **`scripts`** folder at the project root.
- **If you only have the installer:** The default DukaPOS installer does **not** bundle these scripts. You can:
  - Get the scripts from the repo (e.g. clone or download the `scripts` folder), or
  - Run the firewall command manually (see main README or **docs/PRD.md**):  
    **Command Prompt as Administrator:**  
    `netsh advfirewall firewall add rule name="DukaPOS Backend" dir=in action=allow protocol=TCP localport=8000`
  - Find the server IP by running **`ipconfig`** on the server PC and using the IPv4 address shown there.

To ship scripts with the installer, you can add the `scripts` folder to `extraResources` in electron-builder (e.g. copy to `%LOCALAPPDATA%\DukaPOS\scripts`) and document the path in the README.
