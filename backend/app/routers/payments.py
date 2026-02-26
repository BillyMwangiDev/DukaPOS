"""Payments API v1: M-Pesa verify (STK Push status query)."""
from fastapi import APIRouter, HTTPException
from sqlmodel import Session, select

from app.database import engine
from app.models import Receipt
from app.mpesa_utils import query_transaction_status

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/verify/{checkout_id}")
def verify_payment(checkout_id: str):
    """
    Verify M-Pesa STK Push by CheckoutRequestID.
    Calls Daraja STK Query; if ResultCode == "0", updates Transaction:
    payment_status = COMPLETED, mpesa_code = MpesaReceiptNumber, reference_code = MpesaReceiptNumber.
    Returns 200 with success or pending/failed result_desc.
    """
    checkout_id = (checkout_id or "").strip()
    if not checkout_id:
        raise HTTPException(status_code=400, detail="checkout_id required")

    try:
        data = query_transaction_status(checkout_id)
    except ValueError as e:
        if "must be set" in str(e) or "MPESA_CONSUMER" in str(e) or "CONSUMER_KEY" in str(e):
            raise HTTPException(
                status_code=503,
                detail="M-Pesa not configured. Set MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET.",
            ) from e
        raise HTTPException(status_code=502, detail=str(e)) from e

    result_code = str(data.get("ResultCode", ""))
    result_desc = str(data.get("ResultDesc", ""))

    if result_code == "0":
        # Extract MpesaReceiptNumber from CallbackMetadata or ResultParameters
        mpesa_receipt_number = ""
        meta = data.get("CallbackMetadata") or data.get("ResultParameters")
        if isinstance(meta, dict):
            items = meta.get("Item", meta.get("Items", []))
            for item in (items or []):
                if isinstance(item, dict) and item.get("Name") == "MpesaReceiptNumber":
                    mpesa_receipt_number = str(item.get("Value", ""))
                    break

        with Session(engine) as session:
            tx = session.exec(
                select(Receipt).where(Receipt.checkout_request_id == checkout_id)
            ).first()
            if tx:
                tx.payment_status = "COMPLETED"
                tx.mpesa_code = mpesa_receipt_number or tx.mpesa_code
                tx.reference_code = mpesa_receipt_number or tx.reference_code
                session.add(tx)
                session.commit()

        return {
            "success": True,
            "mpesa_receipt_number": mpesa_receipt_number,
            "result_desc": result_desc or "Payment completed.",
        }

    return {
        "success": False,
        "result_code": result_code,
        "result_desc": result_desc or "Pending or failed.",
    }
