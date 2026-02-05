# -*- mode: python ; coding: utf-8 -*-
import sys
import os

block_cipher = None

# Add backend dir to path to help find modules
sys.path.insert(0, os.path.abspath('.'))

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'sqlmodel',
        'app',
        'app.database',
        'app.models',
        'app.routers',
        'app.routers.products',
        'app.routers.transactions',
        'app.routers.customers',
        'app.routers.shifts',
        'app.routers.reports',
        'app.routers.auth',
        'app.routers.settings',
        'app.routers.print_router',
        'app.routers.hardware',
        'app.routers.orders',
        'app.routers.system',
        'app.printer_service',
        'python-multipart',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='server', # Rename to server for compatibility
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
