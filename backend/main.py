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

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

_log_dir = Path(__file__).resolve().parent / "logs"
_log_dir.mkdir(exist_ok=True)
_handlers = [
    logging.StreamHandler(),
    RotatingFileHandler(
        _log_dir / "dukapos.log",
        maxBytes=5 * 1024 * 1024,  # 5 MB
        backupCount=3,
        encoding="utf-8",
    ),
]
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=_handlers,
)
logger = logging.getLogger("dukapos")
logger.info("Backend logging started.")

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
    api_keys,
    discounts,
    suppliers,
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
# CORS: Allow Electron renderer (app://, file://) and localhost dev server.
# Note: allow_origins=["*"] with allow_credentials=True is invalid per CORS spec.
# Since this is an Electron-only app, no browser cookies are used so credentials=False is correct.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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
app.include_router(api_keys.router)
app.include_router(discounts.router)
app.include_router(suppliers.router)


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
    ssl_certfile = os.environ.get("SSL_CERT") or config("SSL_CERT", default="")
    ssl_keyfile = os.environ.get("SSL_KEY") or config("SSL_KEY", default="")
    uvicorn_kwargs = {"host": host, "port": port, "reload": False}
    if ssl_certfile and ssl_keyfile:
        uvicorn_kwargs["ssl_certfile"] = ssl_certfile
        uvicorn_kwargs["ssl_keyfile"] = ssl_keyfile
        logger.info(f"Starting with TLS (cert={ssl_certfile})")
    uvicorn.run(app, **uvicorn_kwargs)
