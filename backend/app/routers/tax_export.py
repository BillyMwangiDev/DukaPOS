"""Tax / eTIMS export: KRA CSV and optional VSCU payload (integration point only; no live KRA call)."""
import csv
import io
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.database import engine
from app.models import Transaction, TransactionItem, Customer, Product, StoreSettings

router = APIRouter(prefix="/tax", tags=["tax"])

STORE_SETTINGS_ID = 1


@router.get("/etims-csv")
def export_etims_csv(
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
):
    """
    Generate KRA eTIMS CSV with columns:
    Invoice_Date, Invoice_Number, Customer_PIN, Total_Amount, VAT_Amount(16%), Exempt_Amount(0).
    """
    with Session(engine) as session:
        stmt = select(Transaction).order_by(Transaction.timestamp)
        if start_date:
            try:
                start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
                stmt = stmt.where(Transaction.timestamp >= start)
            except ValueError:
                pass
        if end_date:
            try:
                end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
                end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
                stmt = stmt.where(Transaction.timestamp <= end)
            except ValueError:
                pass
        txs = session.exec(stmt).all()
        rows = []
        for t in txs:
            inv_date = t.timestamp.strftime("%Y-%m-%d") if t.timestamp else ""
            inv_number = t.invoice_number or f"INV-{t.id}"
            customer_pin = ""
            if t.customer_id:
                cust = session.get(Customer, t.customer_id)
                if cust and getattr(cust, "kra_pin", None):
                    customer_pin = (cust.kra_pin or "").strip()
            total = t.total_amount
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


def build_vscu_payload_for_transaction(transaction_id: int) -> Dict[str, Any] | None:
    """
    Build eTIMS VSCU-style payload for a transaction (for optional live KRA submission).
    Returns None if transaction not found.
    """
    with Session(engine) as session:
        tx = session.get(Transaction, transaction_id)
        if not tx:
            return None
        store = session.get(StoreSettings, STORE_SETTINGS_ID)
        seller_pin = (store.kra_pin or "").strip() if store else ""
        buyer_pin = ""
        if tx.customer_id:
            cust = session.get(Customer, tx.customer_id)
            if cust and getattr(cust, "kra_pin", None):
                buyer_pin = (cust.kra_pin or "").strip()
        inv_number = tx.invoice_number or f"INV-{tx.id}"
        inv_date = tx.timestamp.strftime("%Y-%m-%dT%H:%M:%S") if tx.timestamp else ""
        total = tx.total_amount
        vat_amount = round(total / 1.16 * 0.16, 2)
        items: List[Dict[str, Any]] = []
        for ti in session.exec(select(TransactionItem).where(TransactionItem.transaction_id == tx.id)).all():
            product = session.get(Product, ti.product_id)
            name = product.name if product else f"Product {ti.product_id}"
            line_total = ti.price_at_moment * ti.quantity
            items.append({
                "description": name,
                "quantity": ti.quantity,
                "unit_price": round(ti.price_at_moment, 2),
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
            "transaction_type": "credit_note" if tx.is_return else "sale",
        }


@router.get("/vscu-payload")
def get_vscu_payload(transaction_id: int = Query(..., description="Transaction ID")):
    """
    Build eTIMS VSCU-style payload for a transaction (integration point only).
    When eTIMS is enabled, call this to get the JSON payload to POST to your VSCU/KRA service.
    Optional: set KRA_SUBMISSION_URL to have DukaPOS POST this automatically on each sale.
    """
    payload = build_vscu_payload_for_transaction(transaction_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return payload
