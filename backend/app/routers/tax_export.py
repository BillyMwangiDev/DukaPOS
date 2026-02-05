"""Tax / eTIMS export: KRA CSV and optional VSCU payload (integration point only; no live KRA call)."""
import csv
import io
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.database import engine
from app.models import Receipt, SaleItem, Customer, Product, StoreSettings

router = APIRouter(prefix="/tax", tags=["tax"])

STORE_SETTINGS_ID = 1


@router.get("/etims-csv")
def export_etims_csv(
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
):
    """Generate KRA eTIMS CSV."""
    with Session(engine) as session:
        stmt = select(Receipt).order_by(Receipt.timestamp)
        if start_date:
            try:
                start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
                stmt = stmt.where(Receipt.timestamp >= start)
            except ValueError: pass
        if end_date:
            try:
                end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
                end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
                stmt = stmt.where(Receipt.timestamp <= end)
            except ValueError: pass
            
        receipts = session.exec(stmt).all()
        rows = []
        for r in receipts:
            inv_date = r.timestamp.strftime("%Y-%m-%d") if r.timestamp else ""
            inv_number = r.receipt_id
            customer_pin = ""
            if r.customer_id:
                cust = session.get(Customer, r.customer_id)
                if cust and getattr(cust, "kra_pin", None):
                    customer_pin = (cust.kra_pin or "").strip()
            total = r.total_amount
            vat = round(total / 1.16 * 0.16, 2)
            exempt = 0
            rows.append({
                "Invoice_Date": inv_date,
                "Invoice_Number": inv_number,
                "Customer_PIN": customer_pin,
                "Total_Amount": f"{total:.2f}",
                "VAT_Amount(16%)": f"{vat:.2f}",
                "Exempt_Amount(0)": f"{exempt:.2f}",
            })
            
        buf = io.StringIO()
        if rows:
            w = csv.DictWriter(buf, fieldnames=["Invoice_Date", "Invoice_Number", "Customer_PIN", "Total_Amount", "VAT_Amount(16%)", "Exempt_Amount(0)"])
            w.writeheader()
            w.writerows(rows)
        buf.seek(0)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"KRA_etims_export_{ts}.csv"
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )


def build_vscu_payload_for_transaction(receipt_db_id: int) -> Dict[str, Any] | None:
    """Build eTIMS VSCU-style payload for a receipt."""
    with Session(engine) as session:
        r = session.get(Receipt, receipt_db_id)
        if not r: return None
        store = session.get(StoreSettings, STORE_SETTINGS_ID)
        seller_pin = (store.kra_pin or "").strip() if store else ""
        buyer_pin = ""
        if r.customer_id:
            cust = session.get(Customer, r.customer_id)
            if cust and getattr(cust, "kra_pin", None):
                buyer_pin = (cust.kra_pin or "").strip()
        
        inv_number = r.receipt_id
        inv_date = r.timestamp.strftime("%Y-%m-%dT%H:%M:%S") if r.timestamp else ""
        total = r.total_amount
        vat_amount = round(total / 1.16 * 0.16, 2)
        items: List[Dict[str, Any]] = []
        
        sale_items = session.exec(select(SaleItem).where(SaleItem.receipt_id == r.id)).all()
        for si in sale_items:
            product = session.get(Product, si.product_id)
            name = product.name if product else f"Product {si.product_id}"
            line_total = si.price_at_moment * si.quantity
            items.append({
                "description": name,
                "quantity": si.quantity,
                "unit_price": round(si.price_at_moment, 2),
                "amount": round(line_total, 2),
                "vat_rate": "16",
            })
            
        return {
            "invoice_number": inv_number,
            "invoice_date": inv_date,
            "seller_pin": seller_pin,
            "buyer_pin": buyer_pin or None,
            "total_amount": round(total, 2),
            "vat_amount": vat_amount,
            "items": items,
            "receipt_type": "normal",
            "transaction_type": "credit_note" if r.is_return else "sale",
        }


@router.get("/vscu-payload")
def get_vscu_payload(id: int = Query(..., description="Receipt Database ID")):
    """Get VSCU-style payload for a receipt."""
    payload = build_vscu_payload_for_transaction(id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return payload

