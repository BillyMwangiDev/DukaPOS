"""Print receipt and cash drawer kick. Returns 200 with warning PRINTER_OFFLINE if printer unavailable. Runs in thread so UI stays fluid."""
from concurrent.futures import TimeoutError as FuturesTimeoutError
from fastapi import APIRouter, Body
from pydantic import BaseModel, Field
from typing import List, Optional

from app.printer_service import get_printer, run_in_printer_thread

PRINTER_OFFLINE = "PRINTER_OFFLINE"
TIMEOUT_SEC = 8

router = APIRouter(prefix="/print", tags=["print"])


class ReceiptItem(BaseModel):
    name: str
    quantity: int
    price: float  # gross (VAT-inclusive) per unit


class ReceiptPayload(BaseModel):
    """Accept empty body (API/test compatibility): defaults to no lines, zero total."""
    shop_name: str = "DukaPOS"
    items: List[ReceiptItem] = Field(default_factory=list)
    total_gross: float = 0.0
    payment_method: str = "CASH"


class KickDrawerResponse(BaseModel):
    ok: bool
    status: str = "ok"  # API/test compatibility
    warning: Optional[str] = None


def _do_print_receipt(shop_name: str, items: list, total_gross: float, payment_method: str) -> None:
    printer = get_printer()
    printer.print_receipt(
        shop_name=shop_name,
        items=items,
        total_gross=total_gross,
        payment_method=payment_method,
    )


def _do_kick_drawer() -> None:
    get_printer().kick_drawer()


@router.post("/receipt")
def print_receipt(payload: Optional[ReceiptPayload] = Body(None)):
    """Print receipt via ESC/POS (plain text, no PDF). Returns 200 with warning PRINTER_OFFLINE if printer unavailable. Empty body accepted (API/test compatibility)."""
    req = payload if payload is not None else ReceiptPayload()
    items = [{"name": i.name, "qty": i.quantity, "price": i.price} for i in req.items]
    future = run_in_printer_thread(
        _do_print_receipt,
        req.shop_name,
        items,
        req.total_gross,
        req.payment_method,
    )
    try:
        future.result(timeout=TIMEOUT_SEC)
        return {"ok": True, "status": "ok"}
    except (Exception, concurrent.futures.TimeoutError):
        return {"ok": False, "status": "error", "warning": PRINTER_OFFLINE}


@router.post("/kick-drawer", response_model=KickDrawerResponse)
def kick_drawer():
    """Send cash drawer kick (ESC/POS sequence). Returns 200 with warning PRINTER_OFFLINE if printer not found."""
    future = run_in_printer_thread(_do_kick_drawer)
    try:
        future.result(timeout=TIMEOUT_SEC)
        return KickDrawerResponse(ok=True)
    except (Exception, concurrent.futures.TimeoutError):
        return KickDrawerResponse(ok=False, status="error", warning=PRINTER_OFFLINE)
