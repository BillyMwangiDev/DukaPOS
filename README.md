# DukaPOS: Enterprise-Grade POS for Retail
DukaPOS is a high-availability, offline-first Point of Sale (POS) ecosystem designed to streamline retail operations. It combines the performance of a FastAPI backend with the flexibility of a React-based Electron shell to provide a seamless checkout experience.

<img width="1910" height="984" alt="Screenshot 2026-02-05 123712" src="https://github.com/user-attachments/assets/87f601b3-3e60-4f72-a914-e7502e12ed57" />

<img width="972" height="657" alt="Screenshot 2026-02-05 123722" src="https://github.com/user-attachments/assets/bf4ddbd9-4921-4f57-be2b-41a93e2950ac" />


<img width="1906" height="990" alt="Screenshot 2026-02-05 123752" src="https://github.com/user-attachments/assets/9e2c7440-f9ca-4351-b7ab-fe38e083169b" />

<img width="1906" height="1000" alt="Screenshot 2026-02-05 123806" src="https://github.com/user-attachments/assets/43902ebb-cdca-4617-a91e-d68523dc7137" />



## System Architecture

DukaPOS follows a modern micro-services inspired architecture where the frontend (Electron/React) communicates with a local sidecar service (FastAPI/SQLModel).

- **Data Safety**: Automated daily backups and SQLite transactional integrity.
- **Hardware Agnostic**: Supports any ESC/POS thermal printer and RJ11 cash drawer.
- **Production Ready**: Optimized memory management and secure credential handling.

## Core Features

### High-Efficiency POS Terminal
- **Cart-Left Orientation**: Focuses user attention on the transaction items.
- **Scanner Optimized**: Native support for EAN-13/UPC-A barcode scanners.
- **Mistake Mitigation**: Quick-remove actions and automated inventory adjustments.

### Management & Control
- **Unified Inventory**: Professional vertical list with real-time stock-level visualization.
- **Hardware Automation**: One-click configuration for thermal printers and cash drawers.
- **Credential Wizard**: Secure setup of M-Pesa (Daraja API) keys during installation.

### Financial Integrity
- **Shift Auditing**: Comprehensive cashier shift tracking with float management.
- **Credit Lifecycle**: End-to-end customer debt tracking and balance management.
- **VAT Compliance**: 16% VAT-inclusive pricing model for the Kenyan market.

## Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React, Vite, Lucide Icons, Vitest, Playwright |
| **Backend** | FastAPI, SQLModel, SQLAlchemy, Pytest |
| **CI/CD** | GitHub Actions (Auto-Build, Security Audit) |
| **Database** | SQLite (Offline First) |

## Project Documentation

Detailed technical and operational documentation:

- **[Installation Guide](installation.md)**: Deployment, Hardware, and LAN setup.
- **[Customer Manual](customer_manual.md)**: End-to-end user guide for cashiers and admins.
- **[Database Schema](DATABASE_SCHEMA.md)**: Detailed ERD and data architecture.
- **[System Maintenance](installation.md#database-maintenance)**: Factory resets and data wiping.

## Production Readiness & CI/CD

DukaPOS is protected by a multi-tiered automated pipeline:
- **Dependency Pining**: Strict version lockdown for zero-error builds.
- **Automated QA**: Every commit runs Pytest (Backend) and Playwright (E2E).
- **Security Guard**: Automated `npm audit` and Python `safety` checks.
- **Auto-Artifacts**: Windows Installers are generated automatically on successful merges to `main`.

## Deployment Status

DukaPOS is built for the Windows ecosystem. The following build artifacts are available via GitHub Actions:

- **Installer**: `DukaPOS-Setup.exe` (NSIS Installer)
- **Status**: Stable / Enterprise Ready

---

Built by **BillyMwangiDev**
