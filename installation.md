# DukaPOS Deployment and Operations Guide

This guide provides comprehensive instructions for deploying, configuring, and maintaining the DukaPOS retail system.

## Deployment Options

### 📦 Option A: Standard Windows Installation (Recommended)
Best for retail environments. Includes the automated backend and hardware management.

1.  **Preparation**: Download the `DukaPOS Setup.exe` from your release package.
2.  **Execution**: Run the installer. If a "Windows protected your PC" prompt appears, click **More Info** → **Run Anyway**.
3.  **Configuration Wizard**:
    - Select your installation folder.
    - **Hardware Setup**: During installation, you will be prompted for your M-Pesa Daraja API keys. Provide your Consumer Key, Secret, and Passkey to enable integrated payments.
4.  **Completion**: Launch the application from the desktop shortcut.
    - **Default Admin**: `admin` / `admin123`

### 🛠️ Option B: Advanced Developer Setup (From Source)
Best for custom modifications or theme adjustments.

1.  **Environment**: Ensure Python 3.11+ and Node.js 18+ are installed.
2.  **Dependencies**:
    ```bash
    cd DukaPOS
    npm run install:all
    ```
3.  **Building for Production**:
    To manually bundle the application, run the optimized build command:
    ```bash
    cd electron
    npm run build
    ```
    *Note: The build process is pre-configured with a 4GB memory boost to handle the integrated backend packaging.*

## Database & System Maintenance

### Start Fresh (Factory Reset)
When moving from testing to a live retail environment, use the maintenance script to clear test data while preserving system configurations (Users, Shop Name, Printer Settings):
1. Open a terminal in the project root.
2. Execute: `python scripts/wipe_data.py`.
3. Follow the on-screen confirmation prompts.

### Manual Data Management
- **Local Application Data**: All operational data is stored at `%APPDATA%/DukaPOS/data/pos.db`.
- **System Backups**: Automated snapshots are created daily in the `backups` directory within the installation folder.

## Hardware Integration Guide

| Component | Configuration |
| :--- | :--- |
| **Receipt Printer** | Supports standard 80mm/58mm thermal printers. Toggle "Auto-Print" in Admin Settings. |
| **Cash Drawer** | Connect via RJ11 to the printer. The drawer pops automatically on **CASH** payments. |
| **Barcode Scanner** | Plug-and-play support for laser/CCD scanners. Ensure the scanner is set to "Enter" suffix mode. |

## Network Configurations (LAN)

To run DukaPOS on multiple terminals sharing a single database:
1.  **Host Machine**: Install the app and allow port `8000` through the Windows Firewall.
2.  **Client Machine**: In the POS login screen or Settings, enter the IP address of the Host Machine (e.g., `http://192.168.1.10:8000`).

---

Built by **BillyMwangiDev**
