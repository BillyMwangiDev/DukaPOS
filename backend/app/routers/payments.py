"""Payments API v1: M-Pesa verify (STK Push status query)."""
from fastapi import APIRouter, HTTPException
from sqlmodel import Session, select

from app.database import engine
from app.models import Transaction

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


@router.get("/verify/{checkout_id}")
def verify_payment(checkout_id: str):
    """
    Verify M-Pesa STK Push by CheckoutRequestID.
    Calls Daraja STK Query; if ResultCode == "0", updates Transaction:
    payment_status = COMPLETED, mpesa_code = MpesaReceiptNumber.
    Returns 200 with success or pending/failed result_desc.
    """
    checkout_id = (checkout_id or "").strip()
    if not checkout_id:
        raise HTTPException(status_code=400, detail="checkout_id required")

    import sys
    from pathlib import Path
    # Ensure backend root (parent of app/) is on path for services.mpesa
    backend_root = Path(__file__).resolve().parent.parent.parent
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))
    try:
        from services.mpesa import query_stk_status  # noqa: E402
    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail=f"M-Pesa service not available: {e}",
        )

    result = query_stk_status(checkout_id)

    if result.get("success"):
        mpesa_receipt_number = result.get("mpesa_receipt_number", "")
        with Session(engine) as session:
            tx = session.exec(
                select(Transaction).where(
                    Transaction.checkout_request_id == checkout_id
                )
            ).first()
            if tx:
                tx.payment_status = "COMPLETED"
                tx.mpesa_code = mpesa_receipt_number or tx.mpesa_code
                session.add(tx)
                session.commit()
        return {
            "success": True,
            "mpesa_receipt_number": mpesa_receipt_number,
            "result_desc": result.get("result_desc", "Payment completed."),
        }

    return {
        "success": False,
        "result_code": result.get("result_code", ""),
        "result_desc": result.get("result_desc", "Pending or failed."),
    }
