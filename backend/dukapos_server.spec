# PyInstaller spec for DukaPOS backend (server.exe).
# Run from backend/: pyinstaller dukapos_server.spec
# Requires: pip install pyinstaller
# Output: dist/server.exe (Windows) or dist/server (Linux/macOS)
# Flags: --onefile (single exe), --noconsole (no console window when run by Electron).

# When running from frozen exe, use app object directly (no reload).
# Electron passes API_PORT and DATABASE_URL via env; main.py reads --port or API_PORT.

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'app',
        'app.config',
        'app.database',
        'app.models',
        'app.auth_utils',
        'app.auth_optional',
        'app.mpesa_utils',
        'app.printer_service',
        'app.websocket_manager',
        'app.routers',
        'app.routers.products',
        'app.routers.inventory',
        'app.routers.print_router',
        'app.routers.hardware',
        'app.routers.transactions',
        'app.routers.mpesa',
        'app.routers.payments',
        'app.routers.shifts',
        'app.routers.customers',
        'app.routers.dashboard',
        'app.routers.settings',
        'app.routers.system',
        'app.routers.tax_export',
        'app.routers.users',
        'app.routers.reports',
        'app.routers.orders',
        'app.routers.websocket_router',
        'app.routers.api_keys',
        'app.routers.discounts',
        'app.routers.suppliers',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'decouple',
        'multipart',
        'multipart.multipart',
        'pandas',
        'openpyxl',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # No console window when run as Electron sidecar (--noconsole)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
