"""
DukaPOS FastAPI backend.
Run: uvicorn main:app --host 0.0.0.0 --port 8000
Or from repo root: python backend/main.py
"""
import sys
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_db_and_tables
from app.auth_optional import OptionalAPIKeyMiddleware
from app.routers import (
    products,
    inventory,
    print_router,
    hardware,
    transactions,
    mpesa,
    payments,
    shifts,
    customers,
    dashboard,
    settings as settings_router,
    system,
    tax_export,
    users,
    reports,
    orders,
    websocket_router,
)

# Production mode: disable Swagger UI for security (frozen exe or DUKAPOS_PRODUCTION=1)
is_production = getattr(sys, "frozen", False) or os.environ.get("DUKAPOS_PRODUCTION") == "1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    # Phase 2: auto-backup if newest backup is >24h old (runs in background)
    import threading
    from app.routers.system import run_backup_if_needed
    threading.Thread(target=run_backup_if_needed, daemon=True).start()
    yield
    # shutdown: close printer etc. if needed


app = FastAPI(
    title="DukaPOS API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(OptionalAPIKeyMiddleware)

app.include_router(products.router)
app.include_router(inventory.router)
app.include_router(print_router.router)
app.include_router(hardware.router)
app.include_router(transactions.router)
app.include_router(mpesa.router)
app.include_router(payments.router)
app.include_router(shifts.router)
app.include_router(customers.router)
app.include_router(dashboard.router)
app.include_router(settings_router.router)
app.include_router(system.router)
app.include_router(tax_export.router)
app.include_router(users.router)
app.include_router(reports.router)
app.include_router(orders.router)
app.include_router(websocket_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import sys
    import os
    import uvicorn
    from app.config import config
    host = config("API_HOST", default="0.0.0.0")
    # Port: from env (Electron sidecar) or --port N or config
    port = 8000
    if getattr(sys, "frozen", False) and os.environ.get("API_PORT"):
        port = int(os.environ["API_PORT"])
    else:
        for i, arg in enumerate(sys.argv):
            if arg == "--port" and i + 1 < len(sys.argv):
                port = int(sys.argv[i + 1])
                break
        else:
            port = int(config("API_PORT", default=8000))
    # When run as PyInstaller frozen exe, use app object and no reload
    if getattr(sys, "frozen", False):
        uvicorn.run(app, host=host, port=port, reload=False)
    else:
        uvicorn.run("main:app", host=host, port=port, reload=True)
