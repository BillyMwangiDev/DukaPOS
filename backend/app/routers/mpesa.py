"""M-Pesa Daraja: STK Push, callback webhook, C2B confirmation with automatic WebSocket notification."""
import json
from datetime import datetime, timedelta
from typing import Optional
from urllib.request import Request as UrlRequest, urlopen
from urllib.error import HTTPError, URLError

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import Receipt
from app.mpesa_utils import send_stk_push, get_access_token, DARAJA_BASE
from app.config import config
from app.websocket_manager import manager, EventType, create_event

router = APIRouter(prefix="/mpesa", tags=["mpesa"])


def _extract_stk_callback_result_code(body: dict) -> Optional[int]:
    """Extract ResultCode from Daraja STK callback Body.stkCallback."""
    try:
        stk = (body or {}).get("Body") or {}
        stk = stk.get("stkCallback") if isinstance(stk, dict) else {}
        if isinstance(stk, dict) and "ResultCode" in stk:
            return int(stk["ResultCode"])
    except (TypeError, ValueError):
        pass
    return None


def _extract_checkout_request_id(body: dict) -> str | None:
    try:
        stk = (body or {}).get("Body") or {}
        stk = stk.get("stkCallback") if isinstance(stk, dict) else {}
        if isinstance(stk, dict):
            cid = stk.get("CheckoutRequestID")
            return str(cid).strip() if cid else None
    except (TypeError, ValueError):
        pass
    return None


def _extract_mpesa_receipt_number(body: dict) -> Optional[str]:
    """Extract MpesaReceiptNumber from Body.stkCallback.CallbackMetadata.Item."""
    try:
        stk = (body or {}).get("Body") or {}
        stk = stk.get("stkCallback") if isinstance(stk, dict) else {}
        meta = stk.get("CallbackMetadata") if isinstance(stk, dict) else {}
        items = meta.get("Item") if isinstance(meta, dict) else []
        if not isinstance(items, list):
            return None
        for item in items:
            if isinstance(item, dict) and item.get("Name") == "MpesaReceiptNumber":
                val = item.get("Value")
                return str(val).strip() if val is not None else None
    except (TypeError, ValueError):
        pass
    return None


class VerifyManualRequest(BaseModel):
    code: str


class VerifyManualResponse(BaseModel):
    ok: bool


class STKPushRequest(BaseModel):
    phone: str
    amount: float


@router.post("/stk-push")
def stk_push(data: STKPushRequest):
    """
    Trigger M-Pesa STK Push (Lipa Na M-Pesa Online).
    Requires CONSUMER_KEY, CONSUMER_SECRET (and optionally DARAJA_PASSKEY, DARAJA_SHORTCODE, DARAJA_CALLBACK_URL).
    """
    try:
        result = send_stk_push(data.phone, data.amount)
        if result.get("error"):
            raise HTTPException(
                status_code=502,
                detail=result.get("error", "Daraja returned an error"),
            )
        return result
    except ValueError as e:
        if "CONSUMER_KEY" in str(e) or "must be set" in str(e):
            raise HTTPException(
                status_code=503,
                detail="M-Pesa not configured. Set CONSUMER_KEY and CONSUMER_SECRET.",
            ) from e
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/callback")
async def mpesa_stk_callback(request: Request):
    """
    Daraja STK Push result callback (webhook).
    Safaricom POSTs here when the customer completes or cancels STK Push.
    On ResultCode 0: find Transaction by CheckoutRequestID, set payment_status=COMPLETED, mpesa_code=MpesaReceiptNumber.
    Broadcasts WebSocket event to all connected POS terminals.
    Always returns 200 so Daraja does not retry.
    """
    try:
        body = await request.json()
    except Exception:
        return {"ResultCode": 0, "ResultDesc": "Accepted"}
    result_code = _extract_stk_callback_result_code(body)

    checkout_id = _extract_checkout_request_id(body)
    if result_code == 0 and checkout_id:
        receipt_code = _extract_mpesa_receipt_number(body) or ""
        tx_amount = 0.0
        db_id = None

        with Session(engine) as session:
            r = session.exec(
                select(Receipt).where(Receipt.checkout_request_id == checkout_id)
            ).first()
            if r:
                r.payment_status = "COMPLETED"
                r.reference_code = receipt_code or r.reference_code
                tx_amount = r.total_amount
                db_id = r.id
                session.add(r)
                session.commit()

        # Broadcast payment received to all connected POS terminals
        if db_id:
            event = create_event(
                EventType.MPESA_STK_CALLBACK,
                {
                    "status": "success",
                    "checkout_request_id": checkout_id,
                    "mpesa_receipt": receipt_code,
                    "receipt_id": db_id,
                    "amount": tx_amount,
                }
            )
            await manager.broadcast(event)
    elif result_code is not None and result_code != 0:
        # Payment failed or cancelled - notify frontend
        event = create_event(
            EventType.MPESA_PAYMENT_FAILED,
            {
                "status": "failed",
                "checkout_request_id": checkout_id,
                "result_code": result_code,
            }
        )
        await manager.broadcast(event)

    return {"ResultCode": 0, "ResultDesc": "Success"}


def _parse_c2b_confirmation(body: dict) -> Optional[tuple[str, float]]:
    """
    Parse Daraja C2B Confirmation webhook body.
    Returns (TransID, TransAmount) or None if invalid.
    """
    try:
        trans_id = (body or {}).get("TransID")
        if not trans_id:
            return None
        trans_id = str(trans_id).strip()
        amount_raw = (body or {}).get("TransAmount")
        if amount_raw is None:
            return None
        amount = float(amount_raw) if isinstance(amount_raw, (int, float)) else float(str(amount_raw).strip())
        if amount < 0:
            return None
        return (trans_id, amount)
    except (TypeError, ValueError):
        return None


@router.post("/c2b-confirmation")
async def mpesa_c2b_confirmation(request: Request):
    """
    Daraja C2B Confirmation webhook (Buy Goods / Paybill).
    When a customer pays to your till/paybill, M-Pesa POSTs here with TransID, TransAmount, etc.
    We match a PENDING MPESA transaction by amount (and recent time); set COMPLETED and mpesa_code.
    Broadcasts WebSocket event to all connected POS terminals.
    Always return 200 so Daraja does not retry.
    See docs/MPESA_VERIFICATION.md and https://mpesa-docs.vercel.app/c2b
    """
    try:
        body = await request.json()
    except Exception:
        return {"ResultCode": 0, "ResultDesc": "Accepted"}
    parsed = _parse_c2b_confirmation(body)
    if not parsed:
        return {"ResultCode": 0, "ResultDesc": "Accepted"}
    trans_id, trans_amount = parsed

    # Extract customer info from C2B body
    customer_phone = body.get("MSISDN", "")
    customer_name = " ".join(filter(None, [
        body.get("FirstName", ""),
        body.get("MiddleName", ""),
        body.get("LastName", ""),
    ])).strip()

    # Match PENDING MPESA transaction: same amount (tolerance 0.01), created in last 15 minutes
    cutoff = datetime.utcnow() - timedelta(minutes=15)
    matched_id = None

    with Session(engine) as session:
        candidates = list(
            session.exec(
                select(Receipt)
                .where(Receipt.payment_type == "MOBILE")
                .where(Receipt.payment_status == "PENDING")
                .where(Receipt.total_amount >= trans_amount - 0.01)
                .where(Receipt.total_amount <= trans_amount + 0.01)
                .where(Receipt.timestamp >= cutoff)
                .order_by(Receipt.timestamp.desc())
            )
        )
        for r in candidates:
            if r.reference_code:
                continue
            r.payment_status = "COMPLETED"
            r.reference_code = trans_id
            matched_id = r.id
            session.add(r)
            session.commit()
            break

    # Broadcast C2B payment received to all connected POS terminals
    event = create_event(
        EventType.MPESA_PAYMENT_RECEIVED,
        {
            "trans_id": trans_id,
            "amount": trans_amount,
            "phone": customer_phone,
            "customer_name": customer_name,
            "matched_receipt_id": matched_id,
            "source": "c2b",
        }
    )
    await manager.broadcast(event)

    return {"ResultCode": 0, "ResultDesc": "Success"}


@router.get("/status")
def mpesa_status():
    """Check if Daraja credentials are configured (does not validate token)."""
    try:
        get_access_token()
        return {"configured": True}
    except ValueError:
        return {"configured": False}


class C2BRegisterRequest(BaseModel):
    """Request to register C2B URLs with Safaricom."""
    validation_url: str
    confirmation_url: str
    response_type: str = "Completed"  # "Completed" or "Cancelled"


@router.post("/c2b-register")
def register_c2b_urls(data: C2BRegisterRequest):
    """
    Register C2B Validation and Confirmation URLs with Daraja.
    Call once to set up webhooks for Buy Goods / Paybill payments.
    After registration, when a customer pays to your Till/Paybill:
    1. Safaricom calls your validation_url (optional validation logic)
    2. Safaricom calls your confirmation_url with payment details
    3. Your confirmation endpoint broadcasts via WebSocket to POS terminals
    """
    try:
        token = get_access_token()
    except ValueError as e:
        raise HTTPException(status_code=503, detail="M-Pesa not configured") from e

    shortcode = config("DARAJA_SHORTCODE", default="174379")

    payload = {
        "ShortCode": shortcode,
        "ResponseType": data.response_type,
        "ConfirmationURL": data.confirmation_url,
        "ValidationURL": data.validation_url,
    }

    url = f"{DARAJA_BASE}/mpesa/c2b/v1/registerurl"
    body = json.dumps(payload).encode()
    req = UrlRequest(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        try:
            err_body = e.read().decode()
            return {"error": err_body, "status": e.code}
        except Exception:
            raise HTTPException(status_code=502, detail=f"C2B registration failed: {e}") from e
    except URLError as e:
        raise HTTPException(status_code=502, detail=f"C2B registration failed: {e}") from e


@router.post("/c2b-validation")
async def mpesa_c2b_validation(request: Request):
    """
    Daraja C2B Validation webhook (optional).
    Called before a C2B transaction is completed.
    Return {"ResultCode": 0} to accept, or {"ResultCode": 1} to reject.

    For most POS use cases, we accept all payments by default.
    """
    try:
        await request.json()
    except Exception:
        return {"ResultCode": 0, "ResultDesc": "Accepted"}

    # Accept all payments by default
    # You can add custom validation logic here (e.g., check bill reference, amount limits)
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@router.get("/transaction-status")
def transaction_status(checkout_request_id: str):
    """
    Verify M-Pesa STK Push transaction status (for lost callbacks).
    Query Daraja by CheckoutRequestID returned from STK Push.
    """
    if not checkout_request_id or not checkout_request_id.strip():
        raise HTTPException(status_code=400, detail="checkout_request_id required")
    try:
        from app.mpesa_utils import query_transaction_status
        result = query_transaction_status(checkout_request_id.strip())
        if result.get("error"):
            raise HTTPException(status_code=502, detail=result.get("error", "Daraja error"))
        return result
    except ValueError as e:
        if "CONSUMER_KEY" in str(e) or "must be set" in str(e):
            raise HTTPException(status_code=503, detail="M-Pesa not configured.") from e
        raise HTTPException(status_code=502, detail=str(e)) from e
