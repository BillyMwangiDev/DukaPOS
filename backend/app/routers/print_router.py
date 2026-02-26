"""Print receipt and cash drawer kick. Returns 200 with warning PRINTER_OFFLINE if printer unavailable. Runs in thread so UI stays fluid."""
from concurrent.futures import TimeoutError as FuturesTimeoutError
from fastapi import APIRouter, Body
from pydantic import BaseModel, Field
from typing import List, Optional

from app.printer_service import get_printer, run_in_printer_thread
from app.routers.hardware import PRINTER_OFFLINE, TIMEOUT_SEC

router = APIRouter(prefix="/print", tags=["print"])


class ReceiptItem(BaseModel):
    name: str
    quantity: int
    price: float  # gross (VAT-inclusive) per unit


class ReceiptPayload(BaseModel):
    """Accept empty body (API/test compatibility): defaults to no lines, zero total."""
    shop_name: str = "DukaPOS"
    station_id: str = "POS-01"
    items: List[ReceiptItem] = Field(default_factory=list)
    total_gross: float = 0.0
    payment_method: str = "CASH"
    payment_subtype: Optional[str] = None
    kra_pin: Optional[str] = None
    contact_phone: Optional[str] = None
    payments: Optional[List[dict]] = None  # [{method: string, amount: number, details: {...}}]


class KickDrawerResponse(BaseModel):
    ok: bool
    status: str = "ok"  # API/test compatibility
    warning: Optional[str] = None


def _do_print_receipt(
    shop_name: str,
    items: list,
    total_gross: float,
    payment_method: str,
    station_id: str = "POS-01",
    payment_subtype: Optional[str] = None,
    kra_pin: Optional[str] = None,
    contact_phone: Optional[str] = None,
    payments: Optional[List[dict]] = None,
    receipt_header: str = "",
    receipt_footer: str = "Thank you for shopping!",
) -> None:
    printer = get_printer()
    printer.print_receipt(
        shop_name=shop_name,
        items=items,
        total_gross=total_gross,
        payment_method=payment_method,
        station_id=station_id,
        payment_subtype=payment_subtype,
        kra_pin=kra_pin,
        contact_phone=contact_phone,
        payments=payments,
        receipt_header=receipt_header,
        receipt_footer=receipt_footer,
    )


def _do_kick_drawer() -> None:
    get_printer().kick_drawer()


@router.post("/receipt")
def print_receipt(payload: Optional[ReceiptPayload] = Body(None)):
    """Print receipt via ESC/POS. Returns 200 with warning PRINTER_OFFLINE if printer unavailable."""
    req = payload if payload is not None else ReceiptPayload()

    # Fetch settings from DB to override defaults/payload if needed
    from app.database import engine
    from app.models import StoreSettings
    from sqlmodel import Session, select

    with Session(engine) as session:
        settings = session.exec(select(StoreSettings)).first()
        if settings:
            shop_name = settings.shop_name
            station_id = settings.station_id
            contact_phone = settings.contact_phone
            kra_pin = settings.kra_pin
            receipt_header = settings.receipt_header or ""
            receipt_footer = settings.receipt_footer or "Thank you for shopping!"
        else:
            shop_name = req.shop_name
            station_id = req.station_id
            contact_phone = req.contact_phone
            kra_pin = req.kra_pin
            receipt_header = ""
            receipt_footer = "Thank you for shopping!"

    items = [{"name": i.name, "qty": i.quantity, "price": i.price} for i in req.items]
    future = run_in_printer_thread(
        _do_print_receipt,
        shop_name,
        items,
        req.total_gross,
        req.payment_method,
        station_id,
        req.payment_subtype,
        kra_pin,
        contact_phone,
        req.payments or [],
        receipt_header,
        receipt_footer,
    )
    try:
        future.result(timeout=TIMEOUT_SEC)
        return {"ok": True, "status": "ok"}
    except (Exception, FuturesTimeoutError):
        return {"ok": False, "status": "error", "warning": PRINTER_OFFLINE}


@router.post("/kick-drawer", response_model=KickDrawerResponse)
def kick_drawer():
    """Send cash drawer kick (ESC/POS sequence). Returns 200 with warning PRINTER_OFFLINE if printer not found."""
    future = run_in_printer_thread(_do_kick_drawer)
    try:
        future.result(timeout=TIMEOUT_SEC)
        return KickDrawerResponse(ok=True)
    except (Exception, FuturesTimeoutError):
        return KickDrawerResponse(ok=False, status="error", warning=PRINTER_OFFLINE)
