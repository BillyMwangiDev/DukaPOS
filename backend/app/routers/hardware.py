"""Hardware-agnostic POS peripherals: cash drawer kick. Uses standard ESC/POS sequence (RJ11)."""
import concurrent.futures
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.printer_service import get_printer, run_in_printer_thread

PRINTER_OFFLINE = "PRINTER_OFFLINE"
TIMEOUT_SEC = 8

router = APIRouter(prefix="/hardware", tags=["hardware"])


class KickDrawerResponse(BaseModel):
    ok: bool
    warning: Optional[str] = None


def _do_kick_drawer() -> None:
    """Send raw ESC/POS sequence \\x1b\\x70\\x00\\x19\\xfa (standard for RJ11-connected drawers)."""
    get_printer().kick_drawer()


@router.post("/kick-drawer", response_model=KickDrawerResponse)
def kick_drawer():
    """Trigger cash drawer pulse via printer. Returns 200 with warning PRINTER_OFFLINE if printer unavailable."""
    future = run_in_printer_thread(_do_kick_drawer)
    try:
        future.result(timeout=TIMEOUT_SEC)
        return KickDrawerResponse(ok=True)
    except (Exception, concurrent.futures.TimeoutError):
        return KickDrawerResponse(ok=False, warning=PRINTER_OFFLINE)
